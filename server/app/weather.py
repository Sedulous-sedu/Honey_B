import datetime
from typing import Optional, Dict, Any
from app.state import state
from app.models import WeatherPayload, LvpPhase

class WeatherManager:
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
            state.weather = WeatherPayload(**wx_data)
            state.log_event("WEATHER", f"Weather changed to phase '{phase_name}'. LVP is {'ACTIVE' if state.weather.lvp.active else 'INACTIVE'}.")
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
                    state.weather = WeatherPayload(**wx_data)
                    state.log_event("WEATHER", f"Simulated weather transition to {item['name']}: Visibility {item['visibilityM']}m.")
