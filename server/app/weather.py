import datetime
from typing import Optional, Dict, Any
from app.state import state
from app.models import (
    WeatherPayload,
    LvpPhase,
    FlightStatus,
    PriorityLevel,
    AdvisoryPayload,
    Provenance,
)

class WeatherManager:
    @staticmethod
    def _apply_weather_impacts(phase_name: str):
        """
        Applies realistic operational effects when OMDB transitions into or out of FOG / DENSE_FOG,
        ensuring primary flight UAE231 and CAT-I constrained flight IGO1433 reflect LVP conditions.
        """
        phase_upper = phase_name.upper()
        uae = state.aircraft.get("UAE231")
        igo = state.aircraft.get("IGO1433")

        if phase_upper in ("FOG", "DENSE_FOG"):
            # Primary flight UAE231 (B77W on RWY 30L): LVP spacing doubles to 6-7 NM behind SIA317 & DLH788,
            # compressing UAE231's fuel margin and requiring immediate ATC action (Sidestep 30R / Hold / Priority)
            if uae:
                uae.status = FlightStatus.PRIORITY
                uae.priority.level = PriorityLevel.MINIMUM_FUEL
                uae.priority.reasonCodes = [
                    "LVP_FOG_SPACING_CONFLICT",
                    "LOW_FUEL_MARGIN",
                    "CAT_IIIB_AUTOLAND_REQUIRED",
                ]
                # Tighten fuel so holding in dense fog creates real operational urgency (above 2900kg reserve)
                if uae.fuel.totalKg is not None and uae.fuel.totalKg > 4600:
                    uae.fuel.totalKg = 4450.0
                    uae.fuel.enduranceMin = 36.0

                rvr_val = 400 if phase_upper == "DENSE_FOG" else 900
                state.advisories["UAE231"] = [
                    AdvisoryPayload(
                        advisoryId=state.next_advisory_id(),
                        severity="CRITICAL" if phase_upper == "DENSE_FOG" else "WARNING",
                        category="WEATHER",
                        title=f"OMDB {phase_upper.replace('_', ' ')} — LVP CAT IIIB Active (RVR {rvr_val}m)",
                        summary=(
                            f"Visibility {state.weather.visibilityM if state.weather else 350}m, RVR 30L {rvr_val}m. "
                            "Arrival spacing doubled to 6 NM on RWY 30L; UAE231 fuel endurance 36 min. "
                            "Expect ATC options for RWY 30R CAT IIIB sidestep or DXB VOR holding."
                        ),
                        reasoning=[
                            f"OMDB RVR {rvr_val}m requires LVP CAT IIIB autoland protection",
                            "RWY 30L wake/LVO spacing increased from 3 NM to 6 NM behind DLH788",
                            "UAE231 holding endurance (36 min) requires proactive sequencing",
                        ],
                        provenance=Provenance.RULE_BASED,
                    )
                ]

            if igo:
                igo.status = FlightStatus.UNABLE_TO_LAND
                igo.priority.level = PriorityLevel.ELEVATED
                igo.priority.reasonCodes = ["CANNOT_LAND_IN_CURRENT_VIS", "CAT_I_LIMIT_EXCEEDED"]

        elif phase_upper in ("CLEAR", "LIFTING"):
            if uae and uae.flightPhase not in ("HOLDING", "DIVERTING"):
                uae.status = FlightStatus.NORMAL
                if uae.priority.declarationStatus.value != "CONFIRMED":
                    uae.priority.level = PriorityLevel.NORMAL
                    uae.priority.reasonCodes = []
                    uae.fuel.totalKg = 11200.0
                    uae.fuel.enduranceMin = 116.0
            if igo and igo.flightPhase not in ("DIVERTING",):
                igo.status = FlightStatus.NORMAL
                igo.priority.level = PriorityLevel.NORMAL
                igo.priority.reasonCodes = []

    @staticmethod
    def set_phase(phase_name: str) -> Optional[WeatherPayload]:
        """Jump to a specific weather phase (e.g. FOG, DENSE_FOG, CLEARING, CLEAR)."""
        phase_map = {
            "CLEAR": 0,
            "MIST": 1,
            "FOG": 2,
            "DENSE_FOG": 3,
            "IMPROVING": 4,
            "CLEARING": 4,
            "LIFTING": 5
        }
        idx = phase_map.get(phase_name.upper())
        if idx is not None and idx < len(state.weather_timeline):
            state.current_weather_idx = idx
            wx_data = state.weather_timeline[idx].copy()
            wx_data["observedAt"] = state.get_sim_time_iso()
            wx_data["runwayStates"] = {k: v.model_dump() for k, v in state.runway_states.items()}
            state.weather = WeatherPayload(**wx_data)
            WeatherManager._apply_weather_impacts(phase_name)
            state.log_event(
                "WEATHER",
                f"Weather changed to phase '{phase_name}' (Vis {state.weather.visibilityM}m). "
                f"LVP is {'ACTIVE' if state.weather.lvp.active else 'INACTIVE'}. UAE231 prioritized for LVP handling."
            )
            return state.weather
        return None

    @staticmethod
    def tick(dt_sec: float):
        """Advance weather timeline based on sim time."""
        current_time = state.sim_time_sec
        # Find highest timeline item that is <= current_time
        for i, item in enumerate(state.weather_timeline):
            if current_time >= item["simTimeOffsetSec"]:
                if i != state.current_weather_idx:
                    state.current_weather_idx = i
                    wx_data = item.copy()
                    wx_data["observedAt"] = state.get_sim_time_iso()
                    wx_data["runwayStates"] = {k: v.model_dump() for k, v in state.runway_states.items()}
                    state.weather = WeatherPayload(**wx_data)
                    WeatherManager._apply_weather_impacts(item["name"])
                    state.log_event("WEATHER", f"Simulated weather transition to {item['name']}: Visibility {item['visibilityM']}m.")
