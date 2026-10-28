from typing import List, Dict, Any, Optional
from app.state import state
from app.models import (
    SuggestionItem,
    InstructionType,
    PriorityLevel,
    LvpPhase,
    FlightPhase
)

class SuggestionEngine:
    @staticmethod
    def compute_all_suggestions() -> List[SuggestionItem]:
        """Deterministic rule-based suggestion engine. Recomputed on every state change/tick."""
        new_suggestions: Dict[str, SuggestionItem] = {}

        lvp_active = state.weather.lvp.active if state.weather else False
        rvr_30l = 400
        if state.weather and state.weather.rvr:
            for item in state.weather.rvr:
                if item.runway == "30L":
                    rvr_30l = item.valueM

        # Sort arrivals by distance to threshold
        arrivals = [
            ac for ac in state.aircraft.values()
            if ac.flightPhase in [FlightPhase.ARRIVAL, FlightPhase.APPROACH, FlightPhase.HOLDING]
        ]
        arrivals.sort(key=lambda a: a.position.distanceToThresholdNm)

        # 1. Check CAT I capability during low visibility (e.g. IGO1433)
        for ac in arrivals:
            if lvp_active and ac.capability.lvpApproach == "CAT_I":
                sug_id = f"SUG-DIV-{ac.callsign}"
                new_suggestions[sug_id] = SuggestionItem(
                    suggestionId=sug_id,
                    aircraftId=ac.callsign,
                    instructionType=InstructionType.DIVERT,
                    displayText=f"{ac.callsign} Divert to Sharjah (OMSJ), weather below CAT I minima",
                    params={"alternateIcao": "OMSJ", "routeText": "Direct OMSJ, hold 4000 ft"},
                    reasonCodes=["CANNOT_LAND_IN_CURRENT_VIS", "CAT_I_LIMIT_EXCEEDED"],
                    reasonText=f"RVR is {rvr_30l}m (below CAT I 550m minimum). Immediate alternate diversion required.",
                    urgency="CRITICAL",
                    timeToDecisionPointSec=60,
                    affectedAircraft=[ac.callsign],
                    targetControllerId=ac.assignedControllerId
                )

        # 2. Check low fuel / minimum fuel (e.g. FDB512)
        for ac in arrivals:
            margin = ac.fuel.totalKg - ac.fuel.finalReserveKg
            if ac.fuel.enduranceMin < 45 or margin < 500 or ac.priority.level == PriorityLevel.MINIMUM_FUEL:
                sug_id = f"SUG-FUEL-{ac.callsign}"
                new_suggestions[sug_id] = SuggestionItem(
                    suggestionId=sug_id,
                    aircraftId=ac.callsign,
                    instructionType=InstructionType.APPROACH_CLEARANCE,
                    displayText=f"{ac.callsign} Expedite approach RWY {ac.assignedRunway or '30R'}, direct threshold",
                    params={"approach": f"ILS {ac.assignedRunway or '30R'}"},
                    reasonCodes=["LOW_FUEL_MARGIN", "PRIORITY_APPROACH_REQUIRED"],
                    reasonText=f"Fuel endurance is {round(ac.fuel.enduranceMin)} min (reserve margin: {round(margin)} kg). Expedite sequence to prevent Mayday.",
                    urgency="CRITICAL",
                    timeToDecisionPointSec=45,
                    affectedAircraft=[ac.callsign],
                    targetControllerId=ac.assignedControllerId
                )

        # 3. Check medical priority (e.g. THY762)
        for ac in arrivals:
            if ac.priority.level == PriorityLevel.MEDICAL:
                sug_id = f"SUG-MED-{ac.callsign}"
                new_suggestions[sug_id] = SuggestionItem(
                    suggestionId=sug_id,
                    aircraftId=ac.callsign,
                    instructionType=InstructionType.ALTITUDE,
                    displayText=f"{ac.callsign} Descend and maintain 3000 ft, priority medical handling",
                    params={"targetAltitudeFt": 3000},
                    reasonCodes=["MEDICAL_ON_BOARD", "EXPEDITE_APPROACH"],
                    reasonText="Passenger medical emergency confirmed. Expedited approach profile and priority runway slot allocated.",
                    urgency="HIGH",
                    timeToDecisionPointSec=90,
                    affectedAircraft=[ac.callsign],
                    targetControllerId=ac.assignedControllerId
                )

        # 4. Spacing and Separation (Normal: 3 NM, LVP: 6 NM)
        min_spacing_nm = 6.0 if lvp_active else 3.0
        by_runway: Dict[str, List[Any]] = {}
        for ac in arrivals:
            rwy = ac.assignedRunway or "30L"
            by_runway.setdefault(rwy, []).append(ac)

        for rwy, stream in by_runway.items():
            for i in range(1, len(stream)):
                lead = stream[i - 1]
                trail = stream[i]
                gap = trail.position.distanceToThresholdNm - lead.position.distanceToThresholdNm

                # Extra spacing for heavy behind super or medium behind heavy
                required_gap = min_spacing_nm
                if lead.wakeCategory == "SUPER":
                    required_gap += 2.0
                elif lead.wakeCategory == "HEAVY" and trail.wakeCategory == "MEDIUM":
                    required_gap += 1.5

                if gap < required_gap and gap > 0:
                    deficit = round(required_gap - gap, 1)
                    sug_id = f"SUG-SPC-{trail.callsign}"
                    if gap < 2.0 and lvp_active:
                        # Heavy conflict -> Suggest Hold
                        new_suggestions[sug_id] = SuggestionItem(
                            suggestionId=sug_id,
                            aircraftId=trail.callsign,
                            instructionType=InstructionType.HOLD,
                            displayText=f"{trail.callsign} Hold at DXB VOR, maintain {trail.altitudeFt} ft",
                            params={"fix": "DXB VOR", "holdAltitudeFt": trail.altitudeFt, "legTimeMin": 1.0},
                            reasonCodes=["LVP_SPACING_VIOLATION", "HOLD_REQUIRED"],
                            reasonText=f"Spacing behind {lead.callsign} is {round(gap, 1)} NM (required: {required_gap} NM under LVP). Enter hold to rebuild separation.",
                            urgency="HIGH",
                            timeToDecisionPointSec=90,
                            affectedAircraft=[trail.callsign, lead.callsign],
                            targetControllerId=trail.assignedControllerId
                        )
                    else:
                        # Moderate spacing loss -> Suggest Speed Reduction
                        target_spd = max(160, int(trail.speed.indicatedAirspeedKt - 30))
                        new_suggestions[sug_id] = SuggestionItem(
                            suggestionId=sug_id,
                            aircraftId=trail.callsign,
                            instructionType=InstructionType.SPEED,
                            displayText=f"{trail.callsign} Reduce speed to {target_spd} knots",
                            params={"targetSpeedKt": target_spd},
                            reasonCodes=["LVP_SPACING_EXPANSION", "SPEED_CONTROL"],
                            reasonText=f"Trailing {lead.callsign} by {round(gap, 1)} NM (target: {required_gap} NM). Reduce speed to open {deficit} NM gap.",
                            urgency="MEDIUM",
                            timeToDecisionPointSec=120,
                            affectedAircraft=[trail.callsign, lead.callsign],
                            targetControllerId=trail.assignedControllerId
                        )

        # 5. Check Stand Blocks & Reassignments
        for ac in state.aircraft.values():
            if ac.assignedStand:
                stand_info = state.stands.get(ac.assignedStand)
                if stand_info and stand_info.get("status") == "BLOCKED":
                    sug_id = f"SUG-STN-{ac.callsign}"
                    # Find free stand of matching size
                    alt_stand = None
                    for sid, s in state.stands.items():
                        if s.get("status") == "FREE" and (s.get("size") == stand_info.get("size") or s.get("size") == "WIDE"):
                            alt_stand = sid
                            break
                    target_stand = alt_stand or "C22"
                    new_suggestions[sug_id] = SuggestionItem(
                        suggestionId=sug_id,
                        aircraftId=ac.callsign,
                        instructionType=InstructionType.INFORMATION,
                        displayText=f"Reassign {ac.callsign} to Stand {target_stand} (Stand {ac.assignedStand} Blocked)",
                        params={"standId": target_stand, "previousStandId": ac.assignedStand},
                        reasonCodes=["STAND_BLOCKED", "GATE_REASSIGNMENT"],
                        reasonText=f"Assigned Stand {ac.assignedStand} is blocked due to equipment obstruction. Reassign to {target_stand}.",
                        urgency="HIGH",
                        timeToDecisionPointSec=150,
                        affectedAircraft=[ac.callsign],
                        targetControllerId=ac.assignedControllerId
                    )

        # Update state suggestions: Mark stale ones OUTDATED, add new ones
        for old_id, old_sug in state.suggestions.items():
            if old_id not in new_suggestions and old_sug.status == "ACTIVE":
                old_sug.status = "OUTDATED"

        for sug_id, sug in new_suggestions.items():
            state.suggestions[sug_id] = sug

        return list(state.suggestions.values())
