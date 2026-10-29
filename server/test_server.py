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


def test_risk_advisor_api_non_mutating_and_approval_separation():
    # Reset state first
    client.post("/demo/reset")

    # 1. Knowledge core endpoint
    kc_res = client.get("/api/risk-advisor/knowledge-core")
    assert kc_res.status_code == 200
    kc_data = kc_res.json()
    assert kc_data["metadata"]["policyVersion"] == "OMDB-KC-2026.10-v1.0.0"

    # 2. Evaluate FDB512 without confirmed emergency -> MANUAL_REVIEW_REQUIRED, zero state mutation
    rev_before = state.revision
    cmd_count_before = len(state.commands)
    eval_unconfirmed = client.post("/api/risk-advisor/evaluate", json={
        "emergencyAircraftId": "FDB512",
        "includeAiExplanation": True,
    })
    assert eval_unconfirmed.status_code == 200
    u_data = eval_unconfirmed.json()
    assert u_data["evaluationStatus"] == "MANUAL_REVIEW_REQUIRED"
    assert len(u_data["recommendedCandidates"]) == 0
    assert u_data["llmExplanation"] is not None
    assert state.revision == rev_before
    assert len(state.commands) == cmd_count_before
    assert state.approved_sequence_advisory is None

    # Attempting to approve a candidate when unconfirmed must be rejected with 400
    bad_approve = client.post("/api/risk-advisor/approve-sequence", json={
        "emergencyAircraftId": "FDB512",
        "candidateId": "CAND_SWAP_30R_UP2",
        "controllerId": "CTRL-ARR-02",
    })
    assert bad_approve.status_code == 400

    # 3. Evaluate with what-if override (MAYDAY + CONFIRMED) without mutating live FDB512 state
    eval_whatif = client.post("/api/risk-advisor/evaluate", json={
        "emergencyAircraftId": "FDB512",
        "overrideDeclarationType": "MAYDAY",
        "overrideDeclarationStatus": "CONFIRMED",
        "includeAiExplanation": True,
    })
    assert eval_whatif.status_code == 200
    w_data = eval_whatif.json()
    assert w_data["evaluationStatus"] == "FEASIBLE_CANDIDATES_AVAILABLE"
    assert len(w_data["recommendedCandidates"]) >= 1
    assert len(w_data["recommendedCandidates"]) <= 3
    # Live state must still have declarationType == NONE!
    assert state.aircraft["FDB512"].priority.declarationType.value == "NONE"
    assert len(state.commands) == cmd_count_before

    # 4. Controller confirms declaration via /api/risk-advisor/declaration, then approves estimated sequence
    decl_res = client.post("/api/risk-advisor/declaration", json={
        "aircraftId": "FDB512",
        "declarationType": "MAYDAY",
        "declarationStatus": "CONFIRMED",
        "controllerId": "CTRL-ARR-02",
    })
    assert decl_res.status_code == 200

    top_cand_id = w_data["recommendedCandidates"][0]["candidateId"]
    app_res = client.post("/api/risk-advisor/approve-sequence", json={
        "emergencyAircraftId": "FDB512",
        "candidateId": top_cand_id,
        "controllerId": "CTRL-ARR-02",
        "controllerNotes": "Approve estimated sequence for MAYDAY FDB512",
    })
    assert app_res.status_code == 200
    adv_data = app_res.json()
    assert adv_data["source"] == "CONTROLLER_APPROVED_ESTIMATE"
    assert adv_data["isClearance"] is False
    # Approval of estimated sequence MUST NOT issue a formal ATC command!
    assert len(state.commands) == cmd_count_before

    # 5. Pilot dashboard reflects CONTROLLER_APPROVED_ESTIMATE distinctly from clearances
    dash_res = client.get("/api/dashboard/FDB512")
    assert dash_res.status_code == 200
    dash = dash_res.json()
    assert dash["landingSequence"]["advisorySource"] == "CONTROLLER_APPROVED_ESTIMATE"
    assert dash["landingSequence"]["isClearance"] is False
    assert dash["landingSequence"]["approvedByControllerId"] == "CTRL-ARR-02"
    assert "NOT AN OPERATIVE ATC CLEARANCE" in dash["landingSequence"]["disclaimerText"]

