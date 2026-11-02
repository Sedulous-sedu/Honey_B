"""Recording playback and WHAT_IF scenario fork management.

Provides:
- REPLAY mode: streams real recorded public transponder & METAR observations with manifest and original timestamps.
- WHAT_IF mode: forks an observed snapshot into an isolated sandbox with independent clock,
  explicitly tagging all injected weather, fuel reports, emergency declarations, and clearances.
  Prevents any scenario mutation from leaking into LIVE_OBSERVE.
"""
import os
import json
import uuid
import datetime
import logging
from typing import Dict, Any, Optional, List
from app.models import (
    AircraftStatePayload,
    WeatherPayload,
    Provenance,
    Priority,
    PriorityLevel,
    EmergencyDeclarationType,
    DeclarationStatus,
    Fuel,
    Speed,
    Position
)

logger = logging.getLogger("HoneyB.RecordingManager")

RECORDINGS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../data/recordings"))
DEFAULT_RECORDING = os.path.join(RECORDINGS_DIR, "omdb_live_recording_20261102.json")


class WhatIfScenario:
    def __init__(self, scenario_id: str, name: str, base_aircraft: Dict[str, AircraftStatePayload], base_weather: Optional[WeatherPayload]):
        self.scenario_id = scenario_id
        self.name = name
        self.created_at_utc = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        # Deep copy base aircraft
        self.aircraft: Dict[str, AircraftStatePayload] = {
            k: AircraftStatePayload(**v.model_dump()) for k, v in base_aircraft.items()
        }
        for ac in self.aircraft.values():
            ac.scenarioId = scenario_id

        # Copy weather
        if base_weather:
            self.weather = WeatherPayload(**base_weather.model_dump())
        else:
            self.weather = None

        self.injected_assumptions: List[Dict[str, Any]] = []
        self.commands: Dict[str, Any] = {}
        self.event_log: List[Dict[str, Any]] = []

    def inject_fuel_report(self, aircraft_id: str, fuel_kg: float, endurance_min: float, pilot_callsign: Optional[str] = None):
        ac = self.aircraft.get(aircraft_id)
        if not ac:
            return False
        ac.fuel.totalKg = fuel_kg
        ac.fuel.enduranceMin = endurance_min
        ac.fuel.finalReserveKg = ac.fuel.finalReserveKg or 2900.0
        ac.fuel.provenance = Provenance.PILOT_REPORTED
        now_iso = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        self.injected_assumptions.append({
            "type": "PILOT_FUEL_REPORT",
            "aircraftId": aircraft_id,
            "fuelKg": fuel_kg,
            "enduranceMin": endurance_min,
            "reportedAt": now_iso,
            "provenance": "PILOT_REPORTED"
        })
        return True

    def inject_emergency(self, aircraft_id: str, declaration_type: EmergencyDeclarationType, nature: str):
        ac = self.aircraft.get(aircraft_id)
        if not ac:
            return False
        now_iso = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        ac.priority.declarationType = declaration_type
        ac.priority.declarationStatus = DeclarationStatus.CONFIRMED if declaration_type != EmergencyDeclarationType.NONE else DeclarationStatus.NONE
        ac.priority.level = PriorityLevel.EMERGENCY if declaration_type == EmergencyDeclarationType.MAYDAY else (
            PriorityLevel.ELEVATED if declaration_type == EmergencyDeclarationType.PAN_PAN else PriorityLevel.NORMAL
        )
        ac.priority.emergencyNature = nature
        ac.priority.declaredAtUtc = now_iso
        ac.priority.provenance = Provenance.PILOT_REPORTED

        self.injected_assumptions.append({
            "type": "EMERGENCY_DECLARATION",
            "aircraftId": aircraft_id,
            "declaration": declaration_type.value,
            "nature": nature,
            "declaredAt": now_iso,
            "provenance": "PILOT_REPORTED"
        })
        return True

    def inject_weather(self, weather_phase: str):
        # Only affects this scenario
        now_iso = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        if self.weather:
            self.weather.name = weather_phase
            if weather_phase == "DENSE_FOG":
                self.weather.visibilityM = 350.0
                self.weather.lvp.active = True
                self.weather.lvp.phase = "LVP_ACTIVE"
            elif weather_phase == "CLEAR":
                self.weather.visibilityM = 9999.0
                self.weather.lvp.active = False
                self.weather.lvp.phase = "NONE"

        self.injected_assumptions.append({
            "type": "WEATHER_OVERRIDE",
            "phase": weather_phase,
            "appliedAt": now_iso,
            "provenance": "SIMULATED"
        })


class RecordingManager:
    _active_scenarios: Dict[str, WhatIfScenario] = {}

    @classmethod
    def list_recordings(cls) -> List[Dict[str, Any]]:
        recordings = []
        if os.path.exists(RECORDINGS_DIR):
            for fname in sorted(os.listdir(RECORDINGS_DIR)):
                if fname.endswith(".json"):
                    full_p = os.path.join(RECORDINGS_DIR, fname)
                    try:
                        with open(full_p, "r") as f:
                            data = json.load(f)
                            manifest = data.get("manifest", {})
                            recordings.append({
                                "recordingId": manifest.get("recordingId", fname),
                                "description": manifest.get("description", fname),
                                "filename": fname,
                                "capturedAtUtc": manifest.get("capturedAtUtc"),
                                "aircraftCount": manifest.get("aircraftCount", len(data.get("aircraft", [])))
                            })
                    except Exception:
                        pass
        return recordings

    @classmethod
    def load_recording(cls, filepath: Optional[str] = None) -> Dict[str, Any]:
        target = filepath or DEFAULT_RECORDING
        if not os.path.exists(target):
            raise FileNotFoundError(f"Recording file not found: {target}")
        with open(target, "r") as f:
            return json.load(f)

    @classmethod
    def create_what_if_scenario(
        cls,
        name: str,
        base_aircraft: Dict[str, AircraftStatePayload],
        base_weather: Optional[WeatherPayload]
    ) -> WhatIfScenario:
        scen_id = f"SCEN-{uuid.uuid4().hex[:6].upper()}"
        scenario = WhatIfScenario(scen_id, name, base_aircraft, base_weather)
        cls._active_scenarios[scen_id] = scenario
        return scenario

    @classmethod
    def get_scenario(cls, scenario_id: str) -> Optional[WhatIfScenario]:
        return cls._active_scenarios.get(scenario_id)

    @classmethod
    def list_scenarios(cls) -> List[Dict[str, Any]]:
        return [
            {
                "scenarioId": s.scenario_id,
                "name": s.name,
                "createdAt": s.created_at_utc,
                "aircraftCount": len(s.aircraft),
                "injectedAssumptionsCount": len(s.injected_assumptions)
            }
            for s in cls._active_scenarios.values()
        ]
