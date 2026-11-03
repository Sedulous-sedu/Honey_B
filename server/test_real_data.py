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
    mock_ac.trackId = "TEST123"
    mock_ac.callsign = "TEST123"
    mock_ac.provenance = Provenance.OBSERVED
    mock_ac.fuel.provenance = Provenance.OBSERVED
    mock_ac.fuel.totalKg = 8500.0
    state.observed_aircraft.clear()
    state.observed_aircraft["TEST123"] = mock_ac
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


def test_a0_airline_directory_and_callsign_rules():
    """Verify A0 flight identity matching, alphanumeric callsigns, non-airlines, and no guessed IATA flight numbers."""
    from app.providers.airline_directory import AirlineDirectory

    now_iso = "2026-11-03T07:00:00Z"

    # 1. Known airline match: UAE158 -> Emirates, NO guessed passenger flightNumberIata
    id_uae, disp_uae = AirlineDirectory.resolve_identity(
        icao24="896158",
        callsign_raw="UAE158  ",
        fetched_at_utc=now_iso,
        registration="A6-EQA",
    )
    assert disp_uae == "UAE158"
    assert id_uae.callsignObserved == "UAE158"
    assert id_uae.callsignRaw == "UAE158  "
    assert id_uae.flightNumberIata is None
    assert id_uae.flightNumberStatus == "UNAVAILABLE"
    assert id_uae.operatingAirline is not None
    assert id_uae.operatingAirline.icao == "UAE"
    assert id_uae.operatingAirline.name == "Emirates"
    assert id_uae.identitySource == "CALLSIGN_DIRECTORY"

    # 2. Alphanumeric ATC callsign: UAE6RM -> Emirates, never converted to EK6RM
    id_alpha, disp_alpha = AirlineDirectory.resolve_identity(
        icao24="8965d5",
        callsign_raw="UAE6RM",
        fetched_at_utc=now_iso,
        registration="A6-EOT",
    )
    assert disp_alpha == "UAE6RM"
    assert id_alpha.callsignObserved == "UAE6RM"
    assert id_alpha.flightNumberIata is None
    assert id_alpha.flightNumberStatus == "UNAVAILABLE"
    assert id_alpha.operatingAirline is not None
    assert id_alpha.operatingAirline.icao == "UAE"

    # 3. Air Arabia Abu Dhabi: ADY442 -> ADY / 3L
    id_ady, _ = AirlineDirectory.resolve_identity(
        icao24="896aa1",
        callsign_raw="ADY442",
        fetched_at_utc=now_iso,
        registration="A6-ANH",
    )
    assert id_ady.operatingAirline is not None
    assert id_ady.operatingAirline.icao == "ADY"
    assert id_ady.operatingAirline.iata == "3L"
    assert id_ady.operatingAirline.name == "Air Arabia Abu Dhabi"

    # 4. Civil registration callsign: TCAKB -> NOT matched to an airline
    id_reg, disp_reg = AirlineDirectory.resolve_identity(
        icao24="4bb862",
        callsign_raw="TCAKB",
        fetched_at_utc=now_iso,
        registration="TC-AKB",
    )
    assert disp_reg == "TCAKB"
    assert id_reg.operatingAirline is None
    assert id_reg.identitySource == "REGISTRATION_ONLY"

    # 5. Surface vehicle: MAINT -> SURFACE_TRANSPONDER, no airline
    id_veh, _ = AirlineDirectory.resolve_identity(
        icao24="896c2a",
        callsign_raw="MAINT",
        fetched_at_utc=now_iso,
        registration="VG-01",
    )
    assert id_veh.operatingAirline is None
    assert id_veh.identitySource == "SURFACE_TRANSPONDER"
    assert AirlineDirectory.is_surface_vehicle("MAINT", "C1") is True

    # 6. Missing callsign: "" -> callsignObserved is None, fallback ICAO-896E32
    id_empty, disp_empty = AirlineDirectory.resolve_identity(
        icao24="896e32",
        callsign_raw="   ",
        fetched_at_utc=now_iso,
        registration=None,
    )
    assert id_empty.callsignObserved is None
    assert id_empty.trackId == "TRK-896E32"
    assert id_empty.operatingAirline is None
    assert disp_empty == "ICAO-896E32"


def test_a0_duplicate_callsigns_distinct_icao24_and_callsign_dropout():
    """Verify two distinct icao24 tracks sharing a callsign do not overwrite each other, and callsign dropout preserves identity."""
    from app.providers.adsb_lol import AdsbLolProvider
    from app.state import TrackStore

    now_iso = "2026-11-03T07:00:00Z"
    raw_1 = {
        "hex": "896111",
        "flight": "UAE158  ",
        "lat": 25.30,
        "lon": 55.45,
        "alt_baro": 4500,
        "gs": 210,
        "track": 300,
        "t": "B77W",
        "r": "A6-EQA",
        "category": "A5",
        "seen": 0.4,
    }
    raw_2 = {
        "hex": "896222",
        "flight": "UAE158  ",
        "lat": 25.18,
        "lon": 55.30,
        "alt_baro": 8000,
        "gs": 260,
        "track": 120,
        "t": "A388",
        "r": "A6-EEO",
        "category": "A5",
        "seen": 0.8,
    }

    ac1, _ = AdsbLolProvider.normalize_readsb_track(raw_1, hex_id="896111", received_iso=now_iso, now_epoch=1700000000.0)
    ac2, _ = AdsbLolProvider.normalize_readsb_track(raw_2, hex_id="896222", received_iso=now_iso, now_epoch=1700000000.0)
    assert ac1 is not None and ac2 is not None
    assert ac1.trackId == "TRK-896111"
    assert ac2.trackId == "TRK-896222"
    assert ac1.callsign == "UAE158"
    assert ac2.callsign == "UAE158"

    store = TrackStore()
    store[ac1.trackId] = ac1
    store[ac2.trackId] = ac2
    # Both tracks must coexist in TrackStore without overwriting each other!
    assert len(store) == 2
    assert store["TRK-896111"].registration == "A6-EQA"
    assert store["TRK-896222"].registration == "A6-EEO"

    # Now simulate callsign dropout on 896111 within 120s session
    raw_1_dropout = dict(raw_1, flight="   ", alt_baro=4200)
    ac1_after, _ = AdsbLolProvider.normalize_readsb_track(
        raw_1_dropout,
        hex_id="896111",
        received_iso=now_iso,
        now_epoch=1700000010.0,
        previous_track=ac1,
    )
    assert ac1_after is not None
    assert ac1_after.trackId == "TRK-896111"
    # Session retains previous callsign UAE158 within 120s window
    assert ac1_after.callsign == "UAE158"
    assert ac1_after.identity is not None
    assert ac1_after.identity.operatingAirline is not None
    assert ac1_after.identity.operatingAirline.icao == "UAE"


def test_b_adsb_provider_pool_failover_cooldown_and_monotonicity():
    """Verify AdsbProviderPool automatically fails over on HTTP 429, respects cooldown, rejects older timestamps, and preserves trackId."""
    import asyncio
    import time
    from app.providers.adsb_pool import AdsbProviderPool
    from app.providers.adsb_lol import AdsbLolProvider

    pool = AdsbProviderPool()
    now_iso = "2026-11-03T07:00:00Z"
    now_mono = time.monotonic()

    # Seed shared pool with 2 tracks:
    # - 896abc at obs_epoch = 1000.0
    # - 896old at obs_epoch = 1010.0
    ac_initial, _ = AdsbLolProvider.normalize_readsb_track({
        "hex": "896abc",
        "flight": "FDB574",
        "lat": 25.27,
        "lon": 55.40,
        "alt_baro": 3500,
        "gs": 180,
        "track": 300,
        "t": "B38M",
        "r": "A6-FMJ",
        "seen": 0.5,
    }, hex_id="896abc", received_iso=now_iso, now_epoch=1000.5)
    assert ac_initial is not None

    ac_old_seed, _ = AdsbLolProvider.normalize_readsb_track({
        "hex": "896old",
        "flight": "ETD101",
        "lat": 24.90,
        "lon": 54.90,
        "alt_baro": 9500,
        "gs": 250,
        "track": 290,
        "seen": 0.2,
    }, hex_id="896old", received_iso=now_iso, now_epoch=1010.2)
    assert ac_old_seed is not None

    pool.shared_tracks["896abc"] = ac_initial
    pool.shared_last_seen_mono["896abc"] = now_mono
    pool.shared_last_obs_epoch["896abc"] = 1000.0

    pool.shared_tracks["896old"] = ac_old_seed
    pool.shared_last_seen_mono["896old"] = now_mono
    pool.shared_last_obs_epoch["896old"] = 1010.0

    # Mock primary adsb.lol to return HTTP 429 with Retry-After = 60s
    async def mock_lol_429():
        pool.lol.last_http_status = 429
        pool.lol.last_retry_after_sec = 60.0
        return pool.lol.cached_tracks, []

    # Mock secondary adsb.fi to return HTTP 200 with:
    # - 896abc updated at newer obs_epoch 1008.0 (alt 3100 ft)
    # - 896old with older obs_epoch 1004.0 (alt 12000 ft -> must be rejected by monotonicity!)
    ac_fi_newer, _ = AdsbLolProvider.normalize_readsb_track({
        "hex": "896abc",
        "flight": "FDB574",
        "lat": 25.26,
        "lon": 55.39,
        "alt_baro": 3100,
        "gs": 172,
        "track": 300,
        "t": "B38M",
        "r": "A6-FMJ",
        "seen": 0.2,
    }, hex_id="896abc", received_iso=now_iso, now_epoch=1008.2, provider_name="adsb.fi", previous_track=ac_initial)

    ac_fi_older, _ = AdsbLolProvider.normalize_readsb_track({
        "hex": "896old",
        "flight": "ETD101",
        "lat": 24.90,
        "lon": 54.90,
        "alt_baro": 12000,
        "gs": 250,
        "track": 290,
        "seen": 5.0,
    }, hex_id="896old", received_iso=now_iso, now_epoch=1009.0, provider_name="adsb.fi", previous_track=ac_old_seed)

    async def mock_fi_ok():
        now_m = time.monotonic()
        pool.fi.last_http_status = 200
        pool.fi.last_retry_after_sec = None
        pool.fi.cached_tracks["896abc"] = ac_fi_newer
        pool.fi.last_seen_monotonic["896abc"] = now_m
        pool.fi.last_obs_epoch["896abc"] = 1008.0

        pool.fi.cached_tracks["896old"] = ac_fi_older
        pool.fi.last_seen_monotonic["896old"] = now_m
        pool.fi.last_obs_epoch["896old"] = 1004.0  # Older than 1010.0!
        return pool.fi.cached_tracks, []

    pool.lol.fetch_observations = mock_lol_429
    pool.fi.fetch_observations = mock_fi_ok

    tracks, _ = asyncio.run(pool.fetch_observations())

    # 1. Pool automatically switched from adsb.lol to adsb.fi
    assert pool.active_provider_name == "adsb.fi"
    # 2. Primary adsb.lol slot is placed in cooldown (> now + 50s)
    assert pool.slots[0].next_eligible_mono > time.monotonic() + 50.0
    assert len(pool.switch_diagnostics) >= 1
    assert "429" in pool.switch_diagnostics[0]["reason"] or "failover" in pool.switch_diagnostics[0]["reason"]
    # 3. Newer observation for 896abc is accepted and preserves trackId "TRK-896ABC"
    assert tracks["896abc"].trackId == "TRK-896ABC"
    assert tracks["896abc"].altitudeFt == 3100
    assert tracks["896abc"].sourceProvider == "adsb.fi"
    # 4. Older observation for 896old (1004.0 < 1010.0) was rejected, retaining 9500 ft
    assert tracks["896old"].altitudeFt == 9500


