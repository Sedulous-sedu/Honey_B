# Honey B Real Data Setup & Operational Guide

This document describes the zero-cost, real-data architecture of the **Honey B Ground Control Hub & Cockpit Pilot Advisory System**. The platform runs entirely on free, open, public data sources without requiring paid subscriptions, proprietary tokens, or external compute clusters.

---

## Architecture Overview

```
                      ┌───────────────────────────────────────┐
                      │ NOAA AviationWeather.gov (METAR/TAF) │
                      │ adsb.lol (100 NM OMDB Transponders)   │
                      │ OurAirports (UAE Runways & Stations)  │
                      │ OpenStreetMap (OMDB Geometry / ODbL) │
                      └───────────────────┬───────────────────┘
                                          │ Public HTTP Ingestion
                                          ▼
                      ┌───────────────────────────────────────┐
                      │   Honey B FastAPI Backend (:8000)     │
                      │  - Watchdog & Provider Health Monitor │
                      │  - Mode Isolation & Invariant Safety  │
                      │  - Emergency Resequencing Risk Engine │
                      │  - WebSocket & REST DataLink Hub      │
                      └───────────┬───────────────┬───────────┘
                                  │               │
                 WebSocket / REST │               │ WebSocket / REST
                                  ▼               ▼
        ┌───────────────────────────────┐   ┌──────────────────────────────┐
        │   Ground Control Web (:5173)  │   │     Pilot Web App (:5174)    │
        │   - Live Radar Scope          │   │  - Decision Support Tablet   │
        │   - Honey B Risk Advisor      │   │  - 1.0s Press-Hold Security  │
        │   - Mode Switcher & Sandbox   │   │  - Dual-Source Avionics FMS  │
        └───────────────────────────────┘   └──────────────────────────────┘
```

---

## Quickstart Guide

### Prerequisites
- Python 3.10+ (with `venv`)
- Node.js 18+ and npm

### 1. Start the Backend Server (FastAPI)
```bash
cd "/Users/abinrajbhaskarandevarajan/Honey B"
python3 -m venv server/.venv
source server/.venv/bin/activate
pip install -r server/requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000
```
The server will start on `http://127.0.0.1:8000` and automatically initiate background real data ingestion loops for NOAA Aviation Weather and adsb.lol.

### 2. Start Ground Control Controller Web (:5173)
```bash
cd "/Users/abinrajbhaskarandevarajan/Honey B/web"
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

### 3. Start Cockpit Pilot App (:5174)
```bash
cd "/Users/abinrajbhaskarandevarajan/Honey B/plane"
npm install
npm run dev
```
Open `http://localhost:5174` (or `http://localhost:5174/?flight=UAE231`) in your browser.

---

## Operating Modes

Honey B provides four strictly isolated operational modes:

| Mode | Description | Traffic Ingestion | Clock | Invariant Safety |
|---|---|---|---|---|
| **`LIVE_OBSERVE`** | Primary live monitoring mode | Public live ADS-B & METAR feeds | Wall-clock UTC | Read-only; simulator tick paused; missing fuel/stand reported as `UNKNOWN` |
| **`REPLAY`** | Playback of genuine recorded operations | Real recorded ADS-B & weather observations | Original recording timestamps | Preserves manifest; deterministic playback |
| **`WHAT_IF`** | Interactive sandbox for scenario testing | Forked deep-copy of live or replay traffic | Independent scenario clock | Zero contamination of live state; explicit assumption logging |
| **`FIXTURE_SIMULATION`** | Deterministic benchmark testing | Certified benchmark fleet (`UAE231`, `FDB512`, etc.) | Simulated clock (1.0x-10.0x) | Full deterministic evaluation of 17 safety invariants |

### Switching Modes

#### Via Ground Control Header UI:
Click the **MODE** buttons in the top navigation bar:
- `[LIVE]` → Switches to live public feeds
- `[REPLAY]` → Plays recorded real flight dataset
- `[WHAT-IF]` → Opens a sandboxed scenario
- `[FIXTURE]` → Returns to benchmark simulation

#### Via REST API:
```bash
# Switch to LIVE_OBSERVE
curl -X POST http://127.0.0.1:8000/api/mode \
  -H "Content-Type: application/json" \
  -d '{"mode": "LIVE_OBSERVE"}'

# Switch to REPLAY
curl -X POST http://127.0.0.1:8000/api/mode \
  -H "Content-Type: application/json" \
  -d '{"mode": "REPLAY"}'

# Fork a WHAT_IF scenario
curl -X POST http://127.0.0.1:8000/api/scenario/fork \
  -H "Content-Type: application/json" \
  -d '{"name": "OMDB Fuel Starvation Drill"}'
```

---

## What-If Sandbox Scenarios & Assumption Injection

When testing contingency operations (such as dense fog, low fuel, or medical emergencies), a WHAT_IF scenario isolates changes from live data:

1. **Fork Scenario**:
   In Ground Control, select an aircraft in Flight Detail and click **Fork WHAT-IF**, or send `POST /api/scenario/fork`.
2. **Inject Fuel Report**:
   ```bash
   curl -X POST http://127.0.0.1:8000/api/scenario/{scenario_id}/fuel-report \
     -H "Content-Type: application/json" \
     -d '{
       "aircraftId": "UAE231",
       "fuelOnBoardKg": 2400.0,
       "enduranceMin": 28.0,
       "pilotCallsign": "UAE231"
     }'
   ```
3. **Inject Emergency Declaration**:
   ```bash
   curl -X POST http://127.0.0.1:8000/api/scenario/{scenario_id}/emergency \
     -H "Content-Type: application/json" \
     -d '{
       "aircraftId": "UAE231",
       "declarationType": "MAYDAY",
       "nature": "Fuel starvation warning"
     }'
   ```
4. **Switch Back**:
   Switching back to `LIVE_OBSERVE` leaves the live state completely untouched.

---

## Network & Firewall Requirements

Honey B is designed with a **secure local footprint**:
- **Inbound**: None required from the Internet. The backend binds to `127.0.0.1` and listens locally on port `8000`. Frontends run on `5173` and `5174`.
- **Outbound**:
  - `HTTPS (TCP 443)` to `aviationweather.gov` (NOAA METAR & TAF API).
  - `HTTPS (TCP 443)` to `api.adsb.lol` (public transponder point API).
- **Offline / Air-Gapped Operation**:
  If network access is unavailable, Honey B automatically switches to cached local datasets (`server/data/osm_omdb_geometry.json`, `server/data/recordings/omdb_live_recording_20261102.json`, and `server/data/airport.json`) without interrupting operations.

