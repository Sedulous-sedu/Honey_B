import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.state import state
from app.models import CommandStatus, PilotResponse, InstructionType
from app.command_manager import CommandManager
from app.suggestion import SuggestionEngine

client = TestClient(app)

def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["aircraftCount"] >= 15

def test_pilot_dashboard_integration():
    res = client.get("/api/dashboard/UAE231")
    assert res.status_code == 200
    data = res.json()
    assert data["contractVersion"] == "1.0.0"
    assert data["flightId"] == "UAE231"
    assert data["aircraft"]["callsign"] == "UAE231"
    assert data["landingSequence"]["sequenceNumber"] >= 1
    assert data["landingSequence"]["totalInSequence"] >= 1
    assert data["conditions"]["airportIcao"] == "OMDB"

    # Also test POST /api/pilot-response
    resp = client.post("/api/pilot-response", json={
        "referencedMessageId": "MSG-001",
        "flightId": "UAE231",
        "responseType": "ACKNOWLEDGE",
        "pilotNotes": "Wilco",
        "timestampUtc": "2026-10-28T03:05:00Z"
    })
    assert resp.status_code == 200
    assert resp.json()["success"] is True

def test_weather_fog_jump():
    res = client.post("/demo/fog", json={"phase": "DENSE_FOG"})
    assert res.status_code == 200
    data = res.json()
    assert data["visibilityM"] == 350
    assert data["lvp"]["active"] is True

def test_command_lifecycle():
    # Issue command
    res = client.post("/demo/command", json={
        "aircraftId": "UAE231",
        "instructionType": "ALTITUDE",
        "targetAltitudeFt": 3000,
        "displayText": "Descend and maintain 3000 feet"
    })
    assert res.status_code == 200
    cmd_data = res.json()
    cmd_id = cmd_data["commandId"]
    assert cmd_data["status"] == "SENT"

    # Pilot responds WILCO
    status_payload, err = CommandManager.handle_pilot_response(cmd_id, "UAE231", PilotResponse.WILCO)
    assert err is None
    assert status_payload.status == CommandStatus.ACKNOWLEDGED

def test_unable_and_supersede():
    # Test unable
    res = client.post("/demo/command", json={
        "aircraftId": "UAE231",
        "instructionType": "SPEED",
        "targetSpeedKt": 180
    })
    cmd_id = res.json()["commandId"]
    status_payload, err = CommandManager.handle_pilot_response(cmd_id, "UAE231", PilotResponse.UNABLE, "Fuel state")
    assert status_payload.status == CommandStatus.UNABLE

    # Test supersede
    res = client.post("/demo/command", json={
        "aircraftId": "UAE231",
        "instructionType": "ALTITUDE",
        "targetAltitudeFt": 2500
    })
    cmd_id2 = res.json()["commandId"]
    res_sup = client.post("/demo/supersede", json={"commandId": cmd_id2})
    assert res_sup.status_code == 200
    assert res_sup.json()["status"] == "SUPERSEDED"

def test_suggestions_generated():
    suggestions = SuggestionEngine.compute_all_suggestions()
    assert len(suggestions) > 0
    # In dense fog, IGO1433 (CAT I) must have a divert suggestion
    divert_sug = [s for s in suggestions if s.aircraftId == "IGO1433" and s.instructionType == InstructionType.DIVERT]
    assert len(divert_sug) > 0

def test_stand_reassign():
    res = client.post("/demo/stand", json={"aircraftId": "UAE231", "standId": "B16"})
    assert res.status_code == 200
    assert res.json()["standId"] == "B16"
