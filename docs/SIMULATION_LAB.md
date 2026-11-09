# Honey B UAE Simulation Lab

Implemented on top of Honey B main commit `7d7eeebf09373b12b9dd41c78d32c1a13c584434`.
This is a working first integration for repeatable demonstrations, not a complete
airport digital twin. The existing live/replay stores remain separate.

## Start

From the repository root:

```bash
cd server
python3 -m venv .venv
.venv/bin/pip install -r requirements-simulation.txt
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Open **http://localhost:8000/simulation-lab**, or use **UAE Simulation Lab** in
the Ground Control header. No frontend build is needed for the lab page.
The lab starts paused using the simplified built-in movement model; select
**BlueSky** and load a scenario to use the actual optional engine. Installing
only `requirements.txt` still supports the built-in lab; requesting a missing
BlueSky dependency returns a visible error rather than silently changing engines.
Run one Uvicorn worker: both the legacy hub and lab use process-local state.

The legacy application's live-data mode defaults remain as configured previously.
The lab itself makes no live traffic or weather calls and uses a bundled airport
reference. Loading a lab scenario does not change the legacy hub mode.

## Included integrations

| Project | Implemented role | Execution boundary |
| --- | --- | --- |
| OurAirports | Seven-airport coordinate/runway cache; downloadable reference refresh; source hashes and retrieval date | Reference geography only |
| BlueSky 1.1.1 | Actual detached movement engine; aircraft creation, heading commands, step, readback, retirement and reset; SCN snapshot export | Sole owner of airborne position when selected |
| AirTrafficSim | ZIP containing one FR24-shaped trajectory CSV per simulated flight, ready for its historic replay reader | Export/replay interoperability, not a second running engine |
| BluebirdATC 0.4.0 | HTTP research client: categories, scenarios, load/pause, environment, evolve, and selected actions; optional connection probe | Separate research service; no shared clock with UAE Lab |

Honey B supplies its own original airport resource and scenario code. No upstream
simulator source is copied into Honey B. Upstream licences and datasets are
separate; see `THIRD_PARTY_SIMULATION.md`.

## Demonstrate

1. Select **Fog**, **OMDB**, **During**, seed **42**, and **Load scenario**.
2. The 10-minute checkpoint replays aircraft, fuel, weather, incidents and queues
   from time zero. **After** replays to 30 minutes, preserving prior effects.
3. Advance by 60 seconds, or play at 1x/2x/4x/8x. Pause before manually stepping.
4. View local weather, modeled capacity and regional diversion proposals.
5. Approve one simulated diversion. It changes the flight's destination and
   rechecks parking and fuel screening before a subsequent proposal is accepted.
6. Export trajectories to AirTrafficSim, or export current airborne traffic as a
   BlueSky `.scn` file. The SCN is a traffic snapshot, not a full export of weather,
   fuel, airport resource state or the Honey B scenario timeline.

Weather phases follow a fixed demo timeline: normal before 300 s; onset from
300–600 s; peak from 600–1200 s; improving from 1200–1800 s; clear afterwards.
Rain, gusts and runway restrictions use the same phase schedule. The affected
airport is selected independently. Weather capacity factors are explicitly demo
assumptions, not published limits or aircraft-specific approach approvals.

Random incidents are seeded, occur on fixed simulation-time checks, and temporarily
remove one parking resource. Using the same seed, engine, version, scenario and
control actions reproduces a run; manual diversions alter the subsequent state.
Randomness and the lab clock are independent of wall time. Each run is limited to
four simulated hours. Metrics are accumulated holding minutes, parked arrivals,
and approved diversions; no baseline gains or safety improvements are fabricated.

## Controller and pilot handoff

**Open OMDB snapshot in Honey B** explicitly copies active Dubai-bound aircraft
and the local simulated weather into a new **WHAT_IF** scenario in the existing
hub. It pauses both simulations, clears old hub command/advisory state, and sends
updated snapshots to connected clients. The observed live store is not modified.
The endpoint returns `flightIds`; select one in Ground Control or configure the
pilot display for that identifier. Existing real-flight identifiers such as
`UAE231` are not automatically mapped to the generated demo flights.

This is a **one-time paused copy**, not two-way synchronization. Subsequent
controller commands operate in the legacy OMDB sandbox, not the regional lab.
The legacy dashboard does not yet support regional weather or multi-airport
runway control. Do not resume the legacy engine and describe it as BlueSky motion.

## AirTrafficSim replay

Download **Export AirTrafficSim replay**, unzip, and copy only the
`honeyb_simulated/` folder into the upstream repository's
`airtrafficsim/data/flight_data/` directory. Select that folder as historic replay
in AirTrafficSim. "Historic" is the upstream reader category; the supplied traffic
is explicitly simulated. Keep the ZIP's manifest with the data.

CSV columns: `timestamp` (Unix UTC seconds), `long`, `lat` (degrees), `alt` (feet),
`gspeed` (knots). Samples are recorded every 10 simulated seconds plus the initial
state, with a bounded history. Short runs below 10 seconds have only the initial
sample; advance before exporting to obtain visible trajectories.

## Bluebird research service

Use a separate environment because upstream pins different FastAPI/pandas versions:

```bash
python3 -m venv /tmp/honeyb-bluebird
/tmp/honeyb-bluebird/bin/pip install bluebird-api==0.4.0
/tmp/honeyb-bluebird/bin/uvicorn bluebird_api:app --host 127.0.0.1 --port 8001
```

In a second terminal, from `server/`:

```bash
.venv/bin/python scripts/bluebird_research.py --url http://127.0.0.1:8001
.venv/bin/python scripts/bluebird_research.py --url http://127.0.0.1:8001 --category 'Two Aircraft' --scenario I-Sector --step 6
```

Set `HONEYB_BLUEBIRD_URL=http://127.0.0.1:8001` before starting Honey B to enable
the UI connection check. It only checks available categories; the CLI explicitly
loads and evolves research scenarios. Public API requests cannot supply proxy URLs.
Bluebird's example UK en-route sector is not a UAE airport scenario. This adapter
does not convert regional airport operations into a Bluebird sector model.

## Reference refresh

```bash
.venv/bin/python scripts/refresh_uae_airports.py
```

A failed or incomplete download preserves the previous reference cache. Coordinates
and runway metadata come from OurAirports; arrival rates, stands and operational
capacities do not. Closed runway flags are reference fields, not live NOTAM data.

## Current modeling limits

- 42 seeded arrival flights, six per airport; no continuous traffic generation,
  departure scheduling, aircraft rotations, terminal passengers or crew rostering.
- Airline-style callsigns are generated identifiers. Real scheduled flight numbers,
  routes and airline-specific fleets have not been verified or imported.
- Seven major international airports are included, not every UAE airfield.
- Arrival service and parking are abstract queues, not an actual approach, landing,
  taxiway routing, stand-size compatibility or runway separation simulation.
- Fuel flow, reserve, parking and capacity values are demo assumptions.
- Weather changes capacity; gusts/rain/fog do not produce aerodynamic weather effects.
- Diversion screening checks modeled parking, weather factor and fuel; it does not
  establish legal/operator eligibility, airspace clearance or operational safety.
- UI reads a 1 Hz REST snapshot. Existing controller/pilot WebSocket messages are
  updated only at the explicit OMDB handoff.
- No persisted save/resume, comparative benchmark policy, user accounts or public
  deployment. Bind locally for the demo.

## Validation

```bash
cd server
.venv/bin/pytest -q test_server.py test_real_data.py test_risk_advisor.py test_simulation_lab.py
cd ../web
npm ci
npm run build
```

See `SIMULATION_VALIDATION.md` for executed upstream interoperability checks.
