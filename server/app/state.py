import json
import os
import datetime
from typing import Dict, List, Optional, Any, Set
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
    FlightStatus
)

class AppState:
    def __init__(self):
        self.data_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../data"))
        self.aircraft: Dict[str, AircraftStatePayload] = {}
        self.weather_timeline: List[Dict[str, Any]] = []
        self.current_weather_idx: int = 0
        self.weather: Optional[WeatherPayload] = None
        self.commands: Dict[str, CommandIssuedPayload] = {}
        self.command_history: List[Dict[str, Any]] = []
        self.stands: Dict[str, Dict[str, Any]] = {}
        self.controllers: Dict[str, Dict[str, Any]] = {}
        self.claims: Dict[str, Dict[str, Any]] = {} # e.g. "runway:30L:slot1": {"controllerId": "...", "aircraftId": "..."}
        self.suggestions: Dict[str, SuggestionItem] = {}
        self.advisories: Dict[str, List[AdvisoryPayload]] = {} # aircraftId -> list
        self.event_log: List[Dict[str, Any]] = []
        self.scenario_script: List[Dict[str, Any]] = []
        self.executed_scenario_events: Set[int] = set()
        self.pending_status_events: List[Dict[str, Any]] = []

        self.sim_time_sec: float = 0.0
        self.sim_start_time = datetime.datetime(2026, 10, 28, 3, 0, 0, tzinfo=datetime.timezone.utc)
        self.sim_speed: float = 1.0
        self.is_paused: bool = False
        self.revision: int = 100
        self.command_seq: int = 1
        self.event_seq: int = 100
        self.suggestion_seq: int = 1
        self.advisory_seq: int = 1

        self.load_initial_data()

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

        # Load airport
        with open(os.path.join(self.data_dir, "airport.json")) as f:
            airport_data = json.load(f)
            self.stands = {s["id"]: s for s in airport_data["stands"]}

        # Load controllers
        with open(os.path.join(self.data_dir, "controllers.json")) as f:
            controllers_list = json.load(f)
            self.controllers = {c["id"]: c for c in controllers_list}

        # Load weather timeline
        with open(os.path.join(self.data_dir, "weather_timeline.json")) as f:
            self.weather_timeline = json.load(f)
            self.current_weather_idx = 0
            self.weather = WeatherPayload(**self.weather_timeline[0])

        # Load scenario script
        with open(os.path.join(self.data_dir, "scenario_script.json")) as f:
            self.scenario_script = json.load(f)

        # Load flights
        with open(os.path.join(self.data_dir, "flights.json")) as f:
            flights_list = json.load(f)
            self.aircraft = {fl["aircraftId"]: AircraftStatePayload(**fl) for fl in flights_list}

        # Initialize base advisory for UAE231
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

        self.log_event("SYSTEM", "Initialized scenario and loaded synthetic operations data for OMDB.")

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
