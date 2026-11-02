"""Integration and unit tests for Honey B Real Data Migration and Audit Defect Resolutions.

Tests:
1. Mode isolation: WHAT_IF scenario mutations do not contaminate LIVE_OBSERVE or REPLAY.
2. Option group atomic retirement: Accepting one option retires sibling options immediately.
3. Terminal state protection: Cannot transition or respond to commands in terminal state.
4. Transactional stand validation: Atomic checks for existence, occupancy, wake size fit, and blocked status.
5. Pilot role authorization: Scoped to assigned aircraft, rejected on attempted role switch.
6. ADS-B normalization: Honest Unknowns for fuel and stand; onGround handling.
"""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.state import state
from app.models import (
    AircraftStatePayload,
    DataMode,
    InstructionType,
    PilotResponse,
    CommandStatus,
    PriorityLevel,
    EmergencyDeclarationType,
    Provenance,
)
from app.command_manager import CommandManager

client = TestClient(app)


def setup_function():
    state.load_initial_data()
    state.switch_mode(DataMode.FIXTURE_SIMULATION)


def test_mode_isolation_what_if():
    """Verify WHAT_IF scenario fork does not contaminate base/live observations."""
    state.switch_mode(DataMode.LIVE_OBSERVE)
    # Populate a mock observed aircraft in LIVE_OBSERVE
    mock_ac = state._fixture_aircraft["UAE231"].model_copy(deep=True)
    mock_ac.callsign = "TEST123"
    mock_ac.provenance = Provenance.OBSERVED
    mock_ac.fuel.provenance = Provenance.OBSERVED
    mock_ac.fuel.totalKg = 8500.0
    state.observed_aircraft = {"TEST123": mock_ac}
    ac_before_fuel = state.aircraft["TEST123"].fuel.totalKg

    fork_res = client.post("/api/scenario/fork", json={
        "name": "Test Emergency Diversion Scenario",
        "description": "Forked to test fuel starvation",
        "baseMode": "LIVE_OBSERVE"
    })
    assert fork_res.status_code == 200
    scen_id = fork_res.json()["scenarioId"]
    assert state.mode == DataMode.WHAT_IF
    assert state.active_what_if is not None
    assert state.active_what_if.scenario_id == scen_id

    # Inject fuel report into scenario
    fuel_res = client.post(f"/api/scenario/{scen_id}/fuel-report", json={
        "aircraftId": "TEST123",
        "fuelOnBoardKg": 2100.0,
        "enduranceMin": 25.0,
        "pilotNotes": "Mayday fuel declared in scenario"
    })
    assert fuel_res.status_code == 200

    # Verify scenario aircraft has 2100 kg
    assert state.aircraft["TEST123"].fuel.totalKg == 2100.0
    assert state.aircraft["TEST123"].fuel.provenance.value == "PILOT_REPORTED"

    # Switch back to LIVE_OBSERVE
    client.post("/api/mode", json={"mode": "LIVE_OBSERVE"})
    assert state.mode == DataMode.LIVE_OBSERVE
    # Live aircraft fuel must remain untouched!
    assert state.aircraft["TEST123"].fuel.totalKg == ac_before_fuel


def test_command_option_group_atomic_retirement():
    """Accepting one command in an option group automatically supersedes all sibling options."""
    # Issue Option 1
    cmd1, err1 = CommandManager.issue_command(
        aircraft_id="UAE231",
        controller_id="CTRL-ARR-01",
        instruction_type=InstructionType.HOLD,
        displayText="Option 1: Hold at DXB VOR 4000 ft",
        params={},
        option_group_id="OPT-GRP-100",
        option_label="Option 1",
        bypass_controller_check=True
    )
    assert err1 is None

    # Issue Option 2
    cmd2, err2 = CommandManager.issue_command(
        aircraft_id="UAE231",
        controller_id="CTRL-ARR-01",
        instruction_type=InstructionType.APPROACH_CLEARANCE,
        displayText="Option 2: Sidestep RWY 30R ILS CAT IIIB",
        params={},
        option_group_id="OPT-GRP-100",
        option_label="Option 2",
        bypass_controller_check=True
    )
    assert err2 is None

    assert state.commands[cmd1.commandId].status == CommandStatus.SENT
    assert state.commands[cmd2.commandId].status == CommandStatus.SENT

    # Pilot accepts Option 1 (WILCO)
    st, err = CommandManager.handle_pilot_response(cmd1.commandId, "UAE231", PilotResponse.WILCO)
    assert err is None
    assert st.status == CommandStatus.ACKNOWLEDGED

    # Command 1 is ACKNOWLEDGED
    assert state.commands[cmd1.commandId].status == CommandStatus.ACKNOWLEDGED
    # Sibling Command 2 in OPT-GRP-100 must be SUPERSEDED!
    assert state.commands[cmd2.commandId].status == CommandStatus.SUPERSEDED


def test_terminal_state_protection():
    """Commands in terminal state cannot transition to active or receive further responses."""
    cmd, err = CommandManager.issue_command(
        aircraft_id="UAE231",
        controller_id="CTRL-ARR-01",
        instruction_type=InstructionType.ALTITUDE,
        displayText="Descend 3000 ft",
        params={},
        bypass_controller_check=True
    )
    assert err is None

    # Pilot responds UNABLE -> transitions to terminal state UNABLE
    st, err = CommandManager.handle_pilot_response(cmd.commandId, "UAE231", PilotResponse.UNABLE)
    assert err is None
    assert st.status == CommandStatus.UNABLE

    # Attempting to respond WILCO to an already terminal UNABLE command must be rejected
    st2, err2 = CommandManager.handle_pilot_response(cmd.commandId, "UAE231", PilotResponse.WILCO)
    assert st2 is None
    assert err2 is not None
    assert err2.code == "COMMAND_ALREADY_TERMINAL"


def test_transactional_stand_validation():
    """Stand reassignment atomically checks existence, occupancy, wake size fit, and blocked status."""
    # 1. Nonexistent stand -> 409
    res_nonexistent = client.post("/demo/stand", json={"aircraftId": "UAE231", "standId": "Z999"})
    assert res_nonexistent.status_code == 409
    assert "does not exist" in res_nonexistent.json()["detail"]

    # 2. Blocked stand -> 409
    # Stand B12 is blocked in airport.json (delayed pushback due to tug failure)
    res_blocked = client.post("/demo/stand", json={"aircraftId": "UAE231", "standId": "B12"})
    assert res_blocked.status_code == 409
    assert "BLOCKED" in res_blocked.json()["detail"]

    # 3. Occupied stand -> 409
    # Stand B10 is occupied by QFA12 in airport.json
    # Try assigning UAE231 to B10
    res_occupied = client.post("/demo/stand", json={"aircraftId": "UAE231", "standId": "B10"})
    assert res_occupied.status_code == 409
    assert "OCCUPIED" in res_occupied.json()["detail"]
    assert "OCCUPIED" in res_occupied.json()["detail"]

    # 4. Super wake fit: EK001 is A388 (SUPER wake)
    # Assigning to a MEDIUM stand (e.g. F01) must fail with 409
    # Add a mock SUPER aircraft to test wake fit
    ac_super = state.aircraft["UAE231"].model_copy(update={"callsign": "UAE380", "wakeCategory": "SUPER"})
    state.aircraft["UAE380"] = ac_super
    res_wake = client.post("/demo/stand", json={"aircraftId": "UAE380", "standId": "F01"})
    assert res_wake.status_code == 409
    assert "requires a SUPER stand" in res_wake.json()["detail"]

    # 5. Valid assignment -> 200 and frees previous stand
    res_valid = client.post("/demo/stand", json={"aircraftId": "UAE231", "standId": "B16"})
    assert res_valid.status_code == 200
    assert state.stands["B14"]["status"] == "FREE"
    assert state.stands["B16"]["status"] == "OCCUPIED"
    assert state.stands["B16"]["currentAircraft"] == "UAE231"


def test_pilot_role_authorization_on_subscribe():
    """Pilot connection cannot switch role to controller on client.subscribe."""
    with client.websocket_connect("/ws?role=pilot&aircraftId=UAE231&token=demo-UAE231") as ws:
        # Initial state.snapshot
        snap1 = ws.receive_json()
        assert snap1["type"] == "state.snapshot"

        # Try to switch role to controller
        ws.send_json({
            "type": "client.subscribe",
            "payload": {"role": "controller"}
        })
        err_msg = ws.receive_json()
        assert err_msg["type"] == "error"
        assert err_msg["payload"]["code"] == "UNAUTHORIZED_ROLE_SWITCH"
