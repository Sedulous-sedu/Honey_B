import json
import os
import datetime
from typing import Dict, List, Optional, Any, Set, Tuple
from app.models import (
    AircraftStatePayload,
    WeatherPayload,
    CommandIssuedPayload,
    CommandStatusPayload,
    StandUpdatedPayload,
    AdvisoryPayload,
    SuggestionItem,
    EventEnvelope,
    Provenance,
    CommandStatus,
    PriorityLevel,
    FlightPhase,
    FlightStatus,
    RunwayOperationalState,
    RunwayOperationalStatus,
    RunwayMode,
    LvpApproach,
    DeclarationStatus,
    DataMode,
    ProviderHealth,
    ProviderStatus
)
from app.providers.aviation_weather import AviationWeatherProvider
from app.providers.adsb_lol import AdsbLolProvider
from app.providers.ourairports import OurAirportsProvider
from app.providers.osm_geometry import OsmGeometryProvider
from app.providers.recording_manager import RecordingManager, WhatIfScenario

class AppState:
    def __init__(self):
        self.data_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../data"))
        self.mode: DataMode = DataMode.LIVE_OBSERVE

        # Real observation stores (immutable to simulation loops)
        self.observed_aircraft: Dict[str, AircraftStatePayload] = {}
        self.observed_weather: Optional[WeatherPayload] = None
        self.station_weather: Dict[str, Any] = {}

        # Replay stores (holds recorded observations from genuine flights)
        self.replay_aircraft: Dict[str, AircraftStatePayload] = {}
        self.replay_weather: Optional[WeatherPayload] = None

        # Fixture simulation stores (for labeled benchmark/fixture testing)
        self._fixture_aircraft: Dict[str, AircraftStatePayload] = {}
        self._fixture_weather: Optional[WeatherPayload] = None
        self.weather_timeline: List[Dict[str, Any]] = []
        self.current_weather_idx: int = 0
        self.scenario_script: List[Dict[str, Any]] = []
        self.executed_scenario_events: Set[int] = set()

        # Active WHAT_IF scenario sandbox
        self.active_what_if: Optional[WhatIfScenario] = None

        # Commands and claims
        self.commands: Dict[str, CommandIssuedPayload] = {}
        self.command_history: List[Dict[str, Any]] = []
        self.stands: Dict[str, Dict[str, Any]] = {}
        self.controllers: Dict[str, Dict[str, Any]] = {}
        self.claims: Dict[str, Dict[str, Any]] = {}
        self.suggestions: Dict[str, SuggestionItem] = {}
        self.advisories: Dict[str, List[AdvisoryPayload]] = {}
        self.event_log: List[Dict[str, Any]] = []
        self.pending_status_events: List[Dict[str, Any]] = []
        self.runway_states: Dict[str, RunwayOperationalState] = {}
        self.approved_sequence_advisory: Optional[Dict[str, Any]] = None

        # Providers
        self.weather_provider = AviationWeatherProvider()
        self.adsb_provider = AdsbLolProvider()

        # Clocks
        self.sim_time_sec: float = 0.0
        self.sim_start_time = datetime.datetime.now(datetime.timezone.utc)
        self.sim_speed: float = 1.0
        self.is_paused: bool = False
        self.revision: int = 100
        self.command_seq: int = 1
        self.event_seq: int = 100
        self.suggestion_seq: int = 1
        self.advisory_seq: int = 1

        self.load_initial_data()

    @property
    def aircraft(self) -> Dict[str, AircraftStatePayload]:
        if self.mode == DataMode.WHAT_IF and self.active_what_if:
            return self.active_what_if.aircraft
        elif self.mode == DataMode.LIVE_OBSERVE:
            return self.observed_aircraft
        elif self.mode == DataMode.REPLAY:
            return self.replay_aircraft
        elif self.mode == DataMode.FIXTURE_SIMULATION:
            return self._fixture_aircraft
        return self._fixture_aircraft

    def get_aircraft(self, aircraft_id: str) -> Optional[AircraftStatePayload]:
        """Looks up an aircraft by callsign, ID, or sourceRecordId / hex."""
        if aircraft_id in self.aircraft:
            return self.aircraft[aircraft_id]
        for a in self.aircraft.values():
            if a.callsign == aircraft_id or a.sourceRecordId == aircraft_id:
                return a
        return None

    @aircraft.setter
    def aircraft(self, val: Dict[str, AircraftStatePayload]):
        if self.mode == DataMode.WHAT_IF and self.active_what_if:
            self.active_what_if.aircraft = val
        elif self.mode == DataMode.LIVE_OBSERVE:
            self.observed_aircraft = val
        elif self.mode == DataMode.REPLAY:
            self.replay_aircraft = val
        else:
            self._fixture_aircraft = val

    @property
    def weather(self) -> Optional[WeatherPayload]:
        if self.mode == DataMode.WHAT_IF and self.active_what_if:
            return self.active_what_if.weather
        elif self.mode == DataMode.LIVE_OBSERVE:
            return self.observed_weather
        elif self.mode == DataMode.REPLAY:
            return self.replay_weather
        elif self.mode == DataMode.FIXTURE_SIMULATION:
            return self._fixture_weather
        return self._fixture_weather

    @weather.setter
    def weather(self, val: Optional[WeatherPayload]):
        if self.mode == DataMode.WHAT_IF and self.active_what_if:
            self.active_what_if.weather = val
        elif self.mode == DataMode.LIVE_OBSERVE:
            self.observed_weather = val
        elif self.mode == DataMode.REPLAY:
            self.replay_weather = val
        else:
            self._fixture_weather = val

    def get_sim_time_iso(self) -> str:
        t = self.sim_start_time + datetime.timedelta(seconds=self.sim_time_sec)
        return t.strftime("%Y-%m-%dT%H:%M:%SZ")

    def next_revision(self) -> int:
        self.revision += 1
        return self.revision

    def next_command_id(self) -> str:
        cid = f"CMD-{self.command_seq:03d}"
        self.command_seq += 1
        return cid

    def next_event_id(self) -> str:
        self.event_seq += 1
        return f"evt-{self.event_seq}"

    def next_suggestion_id(self) -> str:
        sid = f"SUG-{self.suggestion_seq:03d}"
        self.suggestion_seq += 1
        return sid

    def next_advisory_id(self) -> str:
        aid = f"ADV-{self.advisory_seq:03d}"
        self.advisory_seq += 1
        return aid

    def load_initial_data(self):
        # Reset counters
        self.sim_time_sec = 0.0
        self.sim_speed = 1.0
        self.is_paused = False
        self.revision = 100
        self.command_seq = 1
        self.event_seq = 100
        self.suggestion_seq = 1
        self.advisory_seq = 1
        self.commands.clear()
        self.command_history.clear()
        self.claims.clear()
        self.suggestions.clear()
        self.advisories.clear()
        self.event_log.clear()
        self.executed_scenario_events.clear()
        self.approved_sequence_advisory = None

        now_iso = self.get_sim_time_iso()
        self.runway_states = {
            "30L": RunwayOperationalState(
                runway="30L",
                serviceable=True,
                status=RunwayOperationalStatus.OPEN,
                mode=RunwayMode.ARRIVAL,
                ilsCategory=LvpApproach.CAT_IIIB,
                smrServiceable=True,
                observedAtUtc=now_iso,
                provenance=Provenance.AUTHORITATIVE
            ),
            "30R": RunwayOperationalState(
                runway="30R",
                serviceable=True,
                status=RunwayOperationalStatus.OPEN,
                mode=RunwayMode.MIXED,
                ilsCategory=LvpApproach.CAT_IIIB,
                smrServiceable=True,
                observedAtUtc=now_iso,
                provenance=Provenance.AUTHORITATIVE
            ),
            "12L": RunwayOperationalState(
                runway="12L",
                serviceable=True,
                status=RunwayOperationalStatus.RESTRICTED,
                mode=RunwayMode.CLOSED,
                ilsCategory=LvpApproach.CAT_IIIB,
                smrServiceable=True,
                reason="Opposite direction to active 30L/30R configuration",
                observedAtUtc=now_iso,
                provenance=Provenance.AUTHORITATIVE
            ),
            "12R": RunwayOperationalState(
                runway="12R",
                serviceable=True,
                status=RunwayOperationalStatus.RESTRICTED,
                mode=RunwayMode.CLOSED,
                ilsCategory=LvpApproach.CAT_IIIB,
                smrServiceable=True,
                reason="Opposite direction to active 30L/30R configuration",
                observedAtUtc=now_iso,
                provenance=Provenance.AUTHORITATIVE
            ),
        }

        # Load airport stands
        with open(os.path.join(self.data_dir, "airport.json")) as f:
            airport_data = json.load(f)
            self.stands = {s["id"]: s for s in airport_data["stands"]}

        # Load controllers
        with open(os.path.join(self.data_dir, "controllers.json")) as f:
            controllers_list = json.load(f)
            self.controllers = {c["id"]: c for c in controllers_list}

        # Load weather timeline (for fixture / benchmark testing)
        with open(os.path.join(self.data_dir, "weather_timeline.json")) as f:
            self.weather_timeline = json.load(f)
            self.current_weather_idx = 0
            wx_init = self.weather_timeline[0].copy()
            wx_init["runwayStates"] = {k: v.model_dump() for k, v in self.runway_states.items()}
            self._fixture_weather = WeatherPayload(**wx_init)

        # Load scenario script
        with open(os.path.join(self.data_dir, "scenario_script.json")) as f:
            self.scenario_script = json.load(f)

        # Load benchmark / fixture flights
        with open(os.path.join(self.data_dir, "flights.json")) as f:
            flights_list = json.load(f)
            self._fixture_aircraft = {}
            for fl in flights_list:
                ac_obj = AircraftStatePayload(**fl)
                if not ac_obj.observedAtUtc:
                    ac_obj.observedAtUtc = now_iso
                if ac_obj.fuel.holdingFuelFlowKgH is not None:
                    if ac_obj.fuel.approachFuelFlowKgH is None:
                        ac_obj.fuel.approachFuelFlowKgH = round(ac_obj.fuel.holdingFuelFlowKgH * 0.92, 1)
                    if ac_obj.fuel.descentFuelFlowKgH is None:
                        ac_obj.fuel.descentFuelFlowKgH = round(ac_obj.fuel.holdingFuelFlowKgH * 0.85, 1)
                if ac_obj.flightPhase == FlightPhase.FINAL or ac_obj.position.distanceToThresholdNm <= 6.0:
                    if ac_obj.flightPhase in (FlightPhase.FINAL, FlightPhase.APPROACH):
                        ac_obj.slotFrozen = True
                if ac_obj.priority.level == PriorityLevel.MEDICAL and ac_obj.priority.declarationStatus == DeclarationStatus.NONE:
                    ac_obj.priority.declarationStatus = DeclarationStatus.UNCONFIRMED
                self._fixture_aircraft[fl["aircraftId"]] = ac_obj

        # Pre-load genuine recording into REPLAY store
        self.observed_aircraft = {}
        self.observed_weather = None
        self.replay_aircraft = {}
        self.replay_weather = None
        try:
            rec = RecordingManager.load_recording()
            rec_aircraft = {}
            for fl in rec.get("aircraft", []):
                obj = self._normalize_replay_aircraft_dict(fl)
                rec_aircraft[obj.callsign] = obj
            self.replay_aircraft = rec_aircraft
            if "weather" in rec:
                rec_wx = rec["weather"].copy()
                rec_wx["runwayStates"] = {k: v.model_dump() for k, v in self.runway_states.items()}
                self.replay_weather = WeatherPayload(**rec_wx)
        except Exception:
            pass

        # Base advisory for UAE231 (in demo / fixture mode)
        adv = AdvisoryPayload(
            advisoryId=self.next_advisory_id(),
            severity="INFO",
            category="SEQUENCE",
            title="Standard approach sequencing",
            summary="Established on ILS 30L arrival profile. Normal arrival spacing in effect.",
            reasoning=["Clear weather conditions", "Standard 3 NM wake separation applied"],
            provenance=Provenance.RULE_BASED
        )
        self.advisories["UAE231"] = [adv]

        self.log_event("SYSTEM", f"Initialized Honey B in mode {self.mode.value}.")

    def validate_and_reassign_stand(self, aircraft_id: str, new_stand_id: str) -> Tuple[bool, Optional[str], Optional[str], Optional[Dict[str, Any]]]:
        """Atomically checks existence, occupancy, wake size fit, and reassigns stand."""
        ac = self.aircraft.get(aircraft_id)
        if not ac:
            return False, f"Aircraft '{aircraft_id}' not found.", None, None

        if new_stand_id not in self.stands:
            return False, f"Stand '{new_stand_id}' does not exist at OMDB.", None, None

        stand = self.stands[new_stand_id]
        if stand.get("status") == "BLOCKED":
            return False, f"Stand '{new_stand_id}' is BLOCKED: {stand.get('notes', 'Maintenance/Tug failure')}.", None, None

        current_occupant = stand.get("currentAircraft")
        if current_occupant and current_occupant != aircraft_id and stand.get("status") == "OCCUPIED":
            return False, f"Stand '{new_stand_id}' is currently OCCUPIED by {current_occupant}.", None, None

        # Wake fit check
        stand_size = stand.get("size", "WIDE")
        ac_wake = ac.wakeCategory
        if ac_wake == "SUPER" and stand_size != "SUPER":
            return False, f"Aircraft wake {ac_wake} requires a SUPER stand (Stand {new_stand_id} is {stand_size}).", None, None

        # Atomic transaction: free old stand and claim new
        prev_stand = ac.assignedStand
        if prev_stand and prev_stand in self.stands and prev_stand != new_stand_id:
            self.stands[prev_stand]["status"] = "FREE"
            self.stands[prev_stand]["currentAircraft"] = None

        stand["status"] = "OCCUPIED"
        stand["currentAircraft"] = aircraft_id
        ac.assignedStand = new_stand_id

        self.log_event("GROUND", f"{aircraft_id} atomically reassigned from stand {prev_stand or 'NONE'} to {new_stand_id}.")
        return True, None, prev_stand, stand

    def switch_mode(self, new_mode: DataMode, scenario_id: Optional[str] = None):
        old_mode = self.mode
        self.mode = new_mode
        if new_mode == DataMode.WHAT_IF:
            if scenario_id:
                scen = RecordingManager.get_scenario(scenario_id)
                if scen:
                    self.active_what_if = scen
            elif not self.active_what_if:
                base_ac = self.aircraft
                self.active_what_if = RecordingManager.create_what_if_scenario(
                    f"Fork at {self.get_sim_time_iso()}",
                    base_ac,
                    self.weather
                )
        elif new_mode == DataMode.LIVE_OBSERVE:
            self.active_what_if = None
        elif new_mode == DataMode.REPLAY:
            self.active_what_if = None
            if not self.replay_aircraft:
                self.start_replay()
        elif new_mode == DataMode.FIXTURE_SIMULATION:
            self.active_what_if = None
        self.log_event("SYSTEM", f"Switched operational mode from {old_mode.value} to {new_mode.value}.")

    @staticmethod
    def _normalize_replay_aircraft_dict(fl: Dict[str, Any]) -> AircraftStatePayload:
        fl_copy = fl.copy()
        if "fuel" not in fl_copy:
            fl_copy["fuel"] = {
                "totalKg": None,
                "enduranceMin": None,
                "holdingFuelFlowKgH": 0.0,
                "finalReserveKg": 2900.0,
                "missingDataReasons": ["Not available in public ADS-B transponder recording"],
                "provenance": "UNKNOWN"
            }
        if "capability" not in fl_copy:
            fl_copy["capability"] = {
                "lvpApproach": "CAT_I",
                "minApprovedRvrM": 550.0,
                "operatorLvoApproved": False,
                "eligibleRunways": ["30L", "30R"],
                "provenance": "UNKNOWN"
            }
        if "priority" not in fl_copy:
            fl_copy["priority"] = {
                "level": "NORMAL",
                "reasonCodes": [],
                "declarationType": "NONE",
                "declarationStatus": "NONE",
                "provenance": "UNKNOWN"
            }
        return AircraftStatePayload(**fl_copy)

    def start_replay(self, recording_file: Optional[str] = None):
        data = RecordingManager.load_recording(recording_file)
        self.mode = DataMode.REPLAY
        self.active_what_if = None
        rec_aircraft = {}
        for fl in data.get("aircraft", []):
            obj = self._normalize_replay_aircraft_dict(fl)
            rec_aircraft[obj.callsign] = obj
        self.replay_aircraft = rec_aircraft
        if "weather" in data:
            rec_wx = data["weather"].copy()
            rec_wx["runwayStates"] = {k: v.model_dump() for k, v in self.runway_states.items()}
            self.replay_weather = WeatherPayload(**rec_wx)
        self.log_event("SYSTEM", f"Started REPLAY of recording: {data.get('manifest', {}).get('description', 'omdb_live')}.")

    def log_event(self, source: str, message: str, details: Optional[Dict[str, Any]] = None):
        entry = {
            "timestamp": self.get_sim_time_iso(),
            "source": source,
            "message": message,
            "details": details or {}
        }
        self.event_log.insert(0, entry)
        if len(self.event_log) > 200:
            self.event_log.pop()

    def create_envelope(self, event_type: str, payload: Any, aircraft_id: Optional[str] = None) -> EventEnvelope:
        rev = self.next_revision()
        evt_id = self.next_event_id()
        payload_data = payload.model_dump() if hasattr(payload, "model_dump") else payload
        return EventEnvelope(
            type=event_type,
            version="v1",
            eventId=evt_id,
            revision=rev,
            timestamp=self.get_sim_time_iso(),
            aircraftId=aircraft_id,
            payload=payload_data
        )

# Global singleton state
state = AppState()
