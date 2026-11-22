import csv
import io
import json
import zipfile
import pytest
import httpx
from fastapi.testclient import TestClient
from app.main import app
from app.state import state
from app.models import DataMode
from app.simulation_lab.api import lab
from app.simulation_lab.runtime import SimulationLab
from app.simulation_lab.interchange import airtrafficsim_zip, BluebirdClient


def test_seven_reference_airports_and_provenance():
    s = SimulationLab().snapshot()
    assert {a["icao"] for a in s["airports"]} == {
        "OMDB",
        "OMDW",
        "OMAA",
        "OMSJ",
        "OMRK",
        "OMFJ",
        "OMAL",
    }
    assert all(a["runways"] for a in s["airports"])
    assert len(s["reference"]["airportsSha256"]) == 64
    assert all(f["identityStatus"] == "GENERATED_DEMO_IDENTIFIER" for f in s["flights"])


@pytest.mark.parametrize("scenario", ["fog", "rain", "gusts", "runway_closure"])
def test_checkpoints_replay_whole_state_and_local_weather(scenario):
    s = SimulationLab()
    s.reset(seed=10, scenario=scenario, phase="during", random_events=True)
    other = SimulationLab()
    other.reset(seed=10, scenario=scenario, random_events=True)
    for _ in range(10):
        other.advance(60)
    assert s.snapshot() == other.snapshot()
    assert s.time == 600
    assert s.airports["OMDB"]["capacityFactor"] < 1
    assert s.airports["OMAA"]["weather"] == "CLEAR"
    assert s.snapshot()["metrics"]["arrived"] > 0
    assert s.history[-1]["timestamp"] > s.history[0]["timestamp"]


def test_after_checkpoint_retains_incident_trail_and_recovers():
    s = SimulationLab()
    s.reset(scenario="fog", phase="after")
    assert s.airports["OMDB"]["capacityFactor"] == 1
    assert any("DENSE_FOG" in e["message"] for e in s.events)
    assert s.snapshot()["metrics"]["holdingMinutes"] > 0


def test_snapshot_is_a_copy_and_demo_fuel_decreases():
    lab = SimulationLab()
    original = lab.snapshot()["flights"][0]["fuelKg"]
    snapshot = lab.snapshot()
    snapshot["airports"][0]["name"] = "changed"
    lab.advance(10)
    assert lab.snapshot()["flights"][0]["fuelKg"] < original
    assert lab.snapshot()["airports"][0]["name"] != "changed"


def test_diversion_changes_route_and_revalidates_capacity():
    s = SimulationLab()
    s.reset(scenario="runway_closure", phase="during")
    s.advance(300)
    rec = s.recommendations()[0]
    s.divert(rec["flightId"], rec["alternate"])
    f = s.flights[rec["flightId"]]
    assert f["destination"] == rec["alternate"] and f["phase"] == "DIVERTING"
    assert s.events[-1]["type"] == "CONTROLLER_APPROVAL"
    with pytest.raises(ValueError):
        s.divert(rec["flightId"], rec["alternate"])


def test_airtrafficsim_archive_columns_units_and_timestamp_order():
    s = SimulationLab()
    s.advance(20)
    archive = zipfile.ZipFile(
        io.BytesIO(airtrafficsim_zip(s.history, {"mode": "SIMULATED"}))
    )
    records = list(
        csv.DictReader(
            io.StringIO(archive.read("honeyb_simulated/UAE100.csv").decode())
        )
    )
    assert set(records[0]) == {"timestamp", "long", "lat", "alt", "gspeed"}
    assert [int(r["timestamp"]) for r in records] == sorted(
        int(r["timestamp"]) for r in records
    )
    assert float(records[0]["alt"]) == 8000
    assert float(records[0]["gspeed"]) == 210
    assert json.loads(archive.read("manifest.json"))["mode"] == "SIMULATED"


def test_bluebird_actual_endpoint_shapes_via_mock_transport():
    seen = []

    def handler(req):
        seen.append((req.method, req.url.path, req.content))
        return httpx.Response(
            200,
            json=(
                ["Artificial"] if req.url.path == "/list_scenario_categories" else True
            ),
        )

    client = BluebirdClient(
        "http://localhost:8001", transport=httpx.MockTransport(handler)
    )
    try:
        assert client.categories() == ["Artificial"]
        client.environment()
        client.evolve(6)
        client.action("AIR123", "change_flight_level_to", 120, "I-Sector")
        assert seen[1][:2] == ("GET", "/environment")
        assert seen[2][:2] == ("POST", "/evolve/6")
        assert json.loads(seen[3][2])[0]["agent"] == "honeyb-research"
        with pytest.raises(ValueError):
            client.evolve(-1)
    finally:
        client.close()


def test_http_validation_exports_and_live_store_isolation():
    client = TestClient(app)
    state.switch_mode(DataMode.LIVE_OBSERVE)
    observed = {k: v.model_dump() for k, v in state.observed_aircraft.items()}
    assert (
        client.post(
            "/api/simulation-lab/reset", json={"scenario": "fog", "phase": "during"}
        ).status_code
        == 200
    )
    assert state.mode == DataMode.LIVE_OBSERVE
    assert {k: v.model_dump() for k, v in state.observed_aircraft.items()} == observed
    assert client.get("/simulation-lab").status_code == 200
    assert (
        client.post("/api/simulation-lab/step", json={"seconds": -1}).status_code == 422
    )
    assert (
        client.post("/api/simulation-lab/reset", json={"airport": "BAD"}).status_code
        == 422
    )
    assert (
        client.post(
            "/api/simulation-lab/control", json={"paused": False, "speed": 4}
        ).status_code
        == 200
    )
    assert (
        client.post("/api/simulation-lab/step", json={"seconds": 60}).status_code == 409
    )
    client.post("/api/simulation-lab/control", json={"paused": True})
    assert (
        client.get("/api/simulation-lab/export/airtrafficsim").headers["content-type"]
        == "application/zip"
    )
    assert ">CRE " in client.get("/api/simulation-lab/export/bluesky").text
    lab.reset()


def test_omdb_handoff_is_explicit_paused_and_uses_existing_pilot_contract():
    client = TestClient(app)
    lab.reset()
    observed = {k: v.model_dump() for k, v in state.observed_aircraft.items()}
    response = client.post("/api/simulation-lab/handoff/omdb")
    assert response.status_code == 200, response.text
    assert state.mode == DataMode.WHAT_IF and state.is_paused and lab.paused
    assert {k: v.model_dump() for k, v in state.observed_aircraft.items()} == observed
    f = response.json()["flightIds"][0]
    dashboard = client.get("/api/dashboard/" + f)
    assert dashboard.status_code == 200, dashboard.text
    assert dashboard.json()["aircraft"]["destinationIcao"] == "OMDB"
    assert dashboard.json()["dataMode"] == "WHAT_IF"
    state.load_initial_data()


def test_bluesky_real_motion_clock_and_reset():
    pytest.importorskip("bluesky")
    s = SimulationLab()
    s.reset(engine="bluesky")
    f = s.snapshot()["flights"][0]
    s.advance(2)
    assert s.time == 2 and s.engine.bs.sim.simt == pytest.approx(2)
    moved = s.flights[f["id"]]
    assert (moved["lat"], moved["lon"]) != (f["lat"], f["lon"])
    assert moved["altitudeFt"] == pytest.approx(8000, abs=20)
    s.reset(engine="bluesky")
    assert s.engine.bs.sim.simt == 0 and len(s.engine.bs.traf.id) == 42


def test_failed_reference_refresh_preserves_cache(tmp_path, monkeypatch):
    from app.providers import ourairports

    cache = tmp_path / "reference.json"
    original = json.dumps({"airports": {"OMDB": {"name": "existing"}}})
    cache.write_text(original)
    monkeypatch.setattr(ourairports, "CACHE_FILE", str(cache))
    monkeypatch.setattr(ourairports, "DATA_DIR", str(tmp_path))

    class FailedClient:
        def __init__(self, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def get(self, url):
            raise httpx.ConnectError("offline")

    monkeypatch.setattr(ourairports.httpx, "Client", FailedClient)
    assert (
        ourairports.OurAirportsProvider.load_or_fetch(force_refresh=True)["airports"][
            "OMDB"
        ]["name"]
        == "existing"
    )
    assert cache.read_text() == original


def test_bluesky_clock_continues_after_last_aircraft_parks():
    pytest.importorskip("bluesky")
    s = SimulationLab()
    s.reset(engine="bluesky")
    for flight in s.flights.values():
        s.engine.retire(flight)
        flight["phase"] = "AT_STAND"
    s.advance(2)
    assert s.time == 2
    assert s.engine.bs.sim.simt == pytest.approx(2)
