import math
import datetime
from typing import List, Dict, Any, Optional
from app.state import state
from app.models import (
    CommandStatus,
    InstructionType,
    FlightPhase,
    FlightStatus,
    PriorityLevel,
    LvpPhase,
    DeclarationStatus,
    EmergencyDeclarationType
)
from app.command_manager import CommandManager
from app.weather import WeatherManager
from app.suggestion import SuggestionEngine

class Simulator:
    @staticmethod
    def tick():
        """Advances simulation by 1 second * sim_speed."""
        if state.is_paused:
            return

        dt = 1.0 * state.sim_speed
        state.sim_time_sec += dt

        # 1. Weather update
        WeatherManager.tick(dt)

        # 2. Check scenario script events
        Simulator._check_scenario_events()

        # 3. Apply executing commands to aircraft targets
        Simulator._apply_commands()

        # 4. Advance kinematics and fuel burn
        Simulator._advance_aircraft(dt)

        # 5. Check command expirations
        CommandManager.check_expirations()

        # 6. Recompute rule-based suggestions
        SuggestionEngine.compute_all_suggestions()

    @staticmethod
    def _check_scenario_events():
        current_time = state.sim_time_sec
        for i, ev in enumerate(state.scenario_script):
            if i not in state.executed_scenario_events and current_time >= ev["timeSec"]:
                state.executed_scenario_events.add(i)
                ev_type = ev.get("type")

                if ev_type == "WEATHER_CHANGE":
                    WeatherManager.set_phase(ev["phase"])
                    state.log_event("SCENARIO", ev["description"])

                elif ev_type == "STAND_BLOCK":
                    sid = ev["standId"]
                    if sid in state.stands:
                        state.stands[sid]["status"] = "BLOCKED"
                        state.stands[sid]["notes"] = ev["reason"]
                    state.log_event("SCENARIO", ev["description"])

                elif ev_type == "CAPABILITY_CONFLICT":
                    ac_id = ev["aircraftId"]
                    ac = state.aircraft.get(ac_id)
                    if ac:
                        ac.status = FlightStatus.UNABLE_TO_LAND
                        ac.priority.level = PriorityLevel.ELEVATED
                        ac.priority.reasonCodes = ["CANNOT_LAND_IN_CURRENT_VIS"]
                    state.log_event("SCENARIO", ev["description"])

                elif ev_type == "FUEL_ALERT":
                    ac_id = ev["aircraftId"]
                    ac = state.aircraft.get(ac_id)
                    if ac:
                        ac.fuel.totalKg = 2400
                        ac.fuel.enduranceMin = 32
                        ac.priority.level = PriorityLevel.MINIMUM_FUEL
                        ac.priority.reasonCodes = ["LOW_FUEL_MARGIN"]
                        # Note: MINIMUM_FUEL is an advisory state; do NOT infer MAYDAY/PAN PAN declaration
                    state.log_event("SCENARIO", ev["description"])

                elif ev_type == "MEDICAL_PRIORITY":
                    ac_id = ev["aircraftId"]
                    ac = state.aircraft.get(ac_id)
                    if ac:
                        ac.priority.level = PriorityLevel.MEDICAL
                        ac.priority.reasonCodes = ["MEDICAL_ON_BOARD"]
                        # Per GCAA eAIC 2020-06, medical report awaits PIC confirmation of PAN PAN / MAYDAY
                        if ac.priority.declarationType == EmergencyDeclarationType.NONE:
                            ac.priority.declarationStatus = DeclarationStatus.UNCONFIRMED
                            ac.priority.emergencyNature = "MEDICAL_REPORT_AWAITING_CONFIRMATION"
                    state.log_event("SCENARIO", ev["description"])

    @staticmethod
    def _apply_commands():
        """Translates ACKNOWLEDGED commands to EXECUTING, and updates aircraft targets."""
        for cmd_id, cmd in state.commands.items():
            ac = state.aircraft.get(cmd.aircraftId)
            if not ac:
                continue

            # Auto-transition ACKNOWLEDGED -> EXECUTING on next tick
            if cmd.status == CommandStatus.ACKNOWLEDGED:
                prev = cmd.status
                cmd.status = CommandStatus.EXECUTING
                state.log_event("SIM", f"Simulator began executing {cmd_id} for {ac.callsign}.")
                state.pending_status_events.append({
                    "aircraftId": ac.callsign,
                    "payload": {
                        "commandId": cmd_id,
                        "status": "EXECUTING",
                        "previousStatus": "ACKNOWLEDGED",
                        "response": "WILCO",
                        "reason": None,
                        "supersededBy": None,
                        "changedAt": state.get_sim_time_iso()
                    }
                })

            if cmd.status == CommandStatus.EXECUTING:
                if cmd.instructionType == InstructionType.ALTITUDE and cmd.targetAltitudeFt is not None:
                    ac.targetAltitudeFt = float(cmd.targetAltitudeFt)
                    # If altitude within 100 ft -> DONE
                    if abs(ac.altitudeFt - cmd.targetAltitudeFt) < 100:
                        prev = cmd.status
                        cmd.status = CommandStatus.DONE
                        state.log_event("SIM", f"Command {cmd_id} completed: {ac.callsign} reached {cmd.targetAltitudeFt} ft.")
                        state.pending_status_events.append({
                            "aircraftId": ac.callsign,
                            "payload": {
                                "commandId": cmd_id,
                                "status": "DONE",
                                "previousStatus": "EXECUTING",
                                "response": "WILCO",
                                "reason": None,
                                "supersededBy": None,
                                "changedAt": state.get_sim_time_iso()
                            }
                        })

                elif cmd.instructionType == InstructionType.SPEED and cmd.targetSpeedKt is not None:
                    ac.targetSpeedKt = float(cmd.targetSpeedKt)
                    if abs(ac.speed.indicatedAirspeedKt - cmd.targetSpeedKt) < 5:
                        cmd.status = CommandStatus.DONE
                        state.log_event("SIM", f"Command {cmd_id} completed: {ac.callsign} adjusted speed to {cmd.targetSpeedKt} kt.")

                elif cmd.instructionType == InstructionType.HEADING and cmd.targetHeadingDeg is not None:
                    ac.targetHeadingDeg = float(cmd.targetHeadingDeg)
                    if abs(ac.headingDeg - cmd.targetHeadingDeg) < 3:
                        cmd.status = CommandStatus.DONE
                        state.log_event("SIM", f"Command {cmd_id} completed: {ac.callsign} established on heading {cmd.targetHeadingDeg}°.")

                elif cmd.instructionType == InstructionType.RUNWAY_CHANGE and cmd.newRunway:
                    ac.assignedRunway = cmd.newRunway
                    ac.approach = cmd.newApproach or f"ILS {cmd.newRunway}"
                    cmd.status = CommandStatus.DONE
                    state.log_event("SIM", f"Command {cmd_id} completed: {ac.callsign} re-assigned to runway {cmd.newRunway}.")

                elif cmd.instructionType == InstructionType.HOLD:
                    ac.flightPhase = FlightPhase.HOLDING
                    ac.status = FlightStatus.HOLDING
                    if cmd.holdAltitudeFt:
                        ac.targetAltitudeFt = float(cmd.holdAltitudeFt)
                    # HOLD remains EXECUTING until released by a new clearance

                elif cmd.instructionType == InstructionType.DIVERT:
                    ac.flightPhase = FlightPhase.DIVERTING
                    ac.status = FlightStatus.DIVERTING
                    if cmd.alternateIcao == "OMSJ":
                        ac.targetHeadingDeg = 45.0
                    else:
                        ac.targetHeadingDeg = 205.0
                    ac.targetAltitudeFt = 4000.0
                    # When diverted past 15 NM away, mark DONE
                    if ac.position.distanceToThresholdNm > 25.0:
                        cmd.status = CommandStatus.DONE
                        state.log_event("SIM", f"Command {cmd_id} completed: {ac.callsign} diverted to alternate.")

                elif cmd.instructionType == InstructionType.INFORMATION:
                    cmd.status = CommandStatus.DONE

    @staticmethod
    def _advance_aircraft(dt: float):
        """Kinematics, fuel burn, and position advancement."""
        lvp_active = state.weather.lvp.active if state.weather else False

        now_iso = state.get_sim_time_iso()
        for ac in state.aircraft.values():
            if not ac.isStale:
                ac.observedAtUtc = now_iso
                ac.dataFreshnessSec = 0.0
            else:
                ac.dataFreshnessSec = (ac.dataFreshnessSec or 0.0) + dt

            # 1. Fuel burn (only when fuel telemetry is available)
            if (
                ac.fuel.totalKg is not None
                and ac.fuel.holdingFuelFlowKgH is not None
                and ac.fuel.finalReserveKg is not None
            ):
                burn_rate_kg_s = (
                    (ac.fuel.holdingFuelFlowKgH / 3600.0)
                    if ac.flightPhase == FlightPhase.HOLDING
                    else (((ac.fuel.approachFuelFlowKgH or (ac.fuel.holdingFuelFlowKgH * 0.9)) / 3600.0))
                )
                burned = burn_rate_kg_s * dt
                ac.fuel.totalKg = max(0.0, ac.fuel.totalKg - burned)
                ac.fuel.enduranceMin = (
                    (ac.fuel.totalKg / (ac.fuel.holdingFuelFlowKgH / 60.0))
                    if ac.fuel.holdingFuelFlowKgH > 0
                    else 999.0
                )

                # Low fuel check (advisory MINIMUM_FUEL only; never auto-declares MAYDAY)
                if (ac.fuel.totalKg - ac.fuel.finalReserveKg) < 400 or ac.fuel.enduranceMin < 40:
                    if ac.priority.level == PriorityLevel.NORMAL:
                        ac.priority.level = PriorityLevel.MINIMUM_FUEL
                        if "LOW_FUEL_MARGIN" not in ac.priority.reasonCodes:
                            ac.priority.reasonCodes.append("LOW_FUEL_MARGIN")

            # 2. Altitude transition
            if ac.targetAltitudeFt is not None and abs(ac.altitudeFt - ac.targetAltitudeFt) > 1:
                diff = ac.targetAltitudeFt - ac.altitudeFt
                step = math.copysign(min(abs(diff), 25.0 * dt), diff) # ~1500 fpm
                ac.altitudeFt = round(ac.altitudeFt + step)
                ac.verticalRateFpm = 1500.0 if step > 0 else -1500.0
            else:
                ac.verticalRateFpm = 0.0

            # 3. Speed transition
            if ac.targetSpeedKt is not None and abs(ac.speed.indicatedAirspeedKt - ac.targetSpeedKt) > 1:
                diff_spd = ac.targetSpeedKt - ac.speed.indicatedAirspeedKt
                step_spd = math.copysign(min(abs(diff_spd), 2.0 * dt), diff_spd)
                ac.speed.indicatedAirspeedKt = round(ac.speed.indicatedAirspeedKt + step_spd)
                ac.speed.groundSpeedKt = ac.speed.indicatedAirspeedKt + 5

            # 4. Heading transition
            if ac.targetHeadingDeg is not None and abs(ac.headingDeg - ac.targetHeadingDeg) > 1:
                hdg_diff = (ac.targetHeadingDeg - ac.headingDeg + 180) % 360 - 180
                turn_step = math.copysign(min(abs(hdg_diff), 3.0 * dt), hdg_diff) # 3 deg/sec standard rate turn
                ac.headingDeg = round((ac.headingDeg + turn_step) % 360)

            # 5. Position along approach path / holding
            if ac.flightPhase == FlightPhase.HOLDING:
                # Orbit pattern around holding fix: turn continuously
                ac.headingDeg = (ac.headingDeg + 2.0 * dt) % 360
            elif ac.flightPhase in [FlightPhase.ARRIVAL, FlightPhase.APPROACH, FlightPhase.FINAL]:
                # Advance toward OMDB threshold (heading 300 deg, moving northwest)
                nm_moved = (ac.speed.groundSpeedKt / 3600.0) * dt
                ac.position.distanceToThresholdNm = max(0.0, ac.position.distanceToThresholdNm - nm_moved)

                # Move lat/lon towards OMDB (25.2532, 55.3657)
                # 1 NM ~ 0.0166 degrees
                rad = math.radians(ac.headingDeg)
                d_lat = (nm_moved * math.cos(rad)) / 60.0
                d_lon = (nm_moved * math.sin(rad)) / (60.0 * math.cos(math.radians(ac.position.lat)))
                ac.position.lat = round(ac.position.lat + d_lat, 5)
                ac.position.lon = round(ac.position.lon + d_lon, 5)

                # Flight phase updates based on distance
                if ac.position.distanceToThresholdNm <= 0.05 and ac.altitudeFt <= 100:
                    ac.flightPhase = FlightPhase.LANDED
                    ac.altitudeFt = 62.0
                    ac.targetSpeedKt = 20.0
                    state.log_event("SIM", f"{ac.callsign} touched down on runway {ac.assignedRunway}.")
                elif ac.position.distanceToThresholdNm <= 3.5:
                    ac.flightPhase = FlightPhase.FINAL
                elif ac.position.distanceToThresholdNm <= 12.0:
                    ac.flightPhase = FlightPhase.APPROACH

            elif ac.flightPhase == FlightPhase.LANDED:
                # Decelerate to taxi speed
                if ac.speed.groundSpeedKt <= 25:
                    ac.flightPhase = FlightPhase.TAXI_IN
                    ac.speed.indicatedAirspeedKt = 12.0
                    ac.speed.groundSpeedKt = 12.0

            elif ac.flightPhase == FlightPhase.DEPARTURE:
                # Climbing out
                nm_moved = (ac.speed.groundSpeedKt / 3600.0) * dt
                ac.position.distanceToThresholdNm += nm_moved
                rad = math.radians(ac.headingDeg)
                d_lat = (nm_moved * math.cos(rad)) / 60.0
                d_lon = (nm_moved * math.sin(rad)) / (60.0 * math.cos(math.radians(ac.position.lat)))
                ac.position.lat = round(ac.position.lat + d_lat, 5)
                ac.position.lon = round(ac.position.lon + d_lon, 5)
