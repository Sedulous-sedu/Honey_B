import json
import os
import sys

# Add server directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.models import (
    EventEnvelope,
    AircraftStatePayload,
    WeatherPayload,
    CommandIssuedPayload,
    CommandStatusPayload,
    StandUpdatedPayload,
    AdvisoryPayload,
    SuggestionItem,
    ReportAckPayload,
    ErrorPayload
)

def export_all():
    schema_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../shared/schema"))
    os.makedirs(schema_dir, exist_ok=True)

    models = {
        "event_envelope.schema.json": EventEnvelope,
        "aircraft_state.schema.json": AircraftStatePayload,
        "weather.schema.json": WeatherPayload,
        "command_issued.schema.json": CommandIssuedPayload,
        "command_status.schema.json": CommandStatusPayload,
        "stand_updated.schema.json": StandUpdatedPayload,
        "advisory.schema.json": AdvisoryPayload,
        "suggestion.schema.json": SuggestionItem,
        "report_ack.schema.json": ReportAckPayload,
        "error.schema.json": ErrorPayload,
    }

    for filename, model in models.items():
        filepath = os.path.join(schema_dir, filename)
        schema = model.model_json_schema()
        with open(filepath, "w") as f:
            json.dump(schema, f, indent=2)
        print(f"Exported {filename}")

if __name__ == "__main__":
    export_all()
