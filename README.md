# 🐝 Honey B — AI-Assisted Aviation Disruption Decision Support System

> **Control-Center Hub & ATC Operations Console**  
> Synthetic Dubai International Airport (OMDB) Low-Visibility Fog Disruption Scenario.

---

## 1. Overview & System Architecture

Honey B is a full-stack, real-time decision-support system designed to assist air traffic controllers, airport dispatchers, and air navigation service providers (ANSPs) during unexpected disruption events—such as sudden dense fog requiring Low Visibility Procedures (LVP).

The **Ground-Control Server is the SINGLE SOURCE OF TRUTH**:
- Owns the 1 Hz kinematics and fuel burn simulation for 28 active flights at OMDB.
- Owns weather timelines and runway visual range (RVR) transitions.
- Executes deterministic rule-based safety suggestions (separation, low-fuel priority, CAT I minima diversion, stand conflicts).
- Authoritatively manages the command state machine (`SENT` → `ACKNOWLEDGED` → `EXECUTING` → `DONE / UNABLE / SUPERSEDED`).
- Streams real-time WebSocket events to both the ATC Control-Center Wall and the connected Pilot Cockpit.

```
                           +----------------------------------------+
                           |     HONEY B CENTRAL GROUND HUB         |
                           |       (FastAPI + WebSockets)           |
                           |   Single Authoritative Source of Truth  |
                           +----------------------------------------+
                                        |              |
                      ws://0.0.0.0:8000/ws             ws://0.0.0.0:8000/ws
                        (role=controller)                 (role=pilot)
                                        |              |
                                        v              v
            +------------------------------+        +---------------------------+
            | CONTROL-CENTER CONSOLE (ME)  |        | PILOT COCKPIT (TEAMMATE)  |
            | - 30 NM Radar Scope          |        | - Cockpit flight displays |
            | - Traffic List (28 tracks)   |        | - Clearance inbox         |
            | - Honey B Suggested Actions  |        | - WILCO / UNABLE / STANDBY|
            | - Team Roster & Stand Board  |        | - Outbound pilot reports  |
            +------------------------------+        +---------------------------+
```

---

## 2. Quickstart Run Instructions

### Prerequisites
- Python 3.11+
- Node.js 18+ and npm

### Step 1: Start the Ground Control Hub (Server)
```bash
cd Honey_B/server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Run server on port 8000 (binds 0.0.0.0:8000)
uvicorn app.main:app --host 0.0.0.0 --port 8000
```
Server health check: `http://localhost:8000/health`

### Step 2: Start the Control-Center UI (Web)
```bash
cd Honey_B/web
npm install
npm run dev
```
Open **`http://localhost:3000`** in your browser.

---

## 3. Two-Page Control Room UI

### Page 1: Main ATC Wall Screen (`/` or toggle in header)
- **Air Traffic List (Left)**: Filter tabs for `ALL (28)`, `ARR (12)`, `DEP (11)`, `OTHER (5)` with real-time distance, wake type, and controller assignment badges.
- **Surveillance Radar Scope (Center)**: Dark canvas/SVG radar scope with 5, 10, 15, 20, 30 NM range rings, OMDB runways (12L/30R & 12R/30L), DXB VOR holding pattern, aircraft blips with heading vectors, and standard 3-line data blocks (`CALLSIGN`, `ALTITUDE ↓`, `GROUND SPEED`).
- **Meteorological Card (Top-Right)**: Real-time METAR, visibility in metres, RVR trends for runways 30L/30R, wind vector, QNH, and LVP status banner.
- **Honey B Decision Support (Right)**:
  - *Filtered & Prioritized Data*: Active wake turbulence and fog constraints.
  - *Suggested Commands*: Ranked ATC clearances with 1-click **Send** buttons.
  - *Interactive AI Rationale*: Ask natural language questions ("Why is FDB512 prioritized?", "Who is most at risk?").
- **Flight Detail Drawer (Bottom)**: Telemetry, fuel margin vs final reserve, and clearance history for the selected aircraft.

### Page 2: Team and Operations Dashboard
- **Controller Roster**: Active sector controllers (Ahmed, Sara, Tariq, Fatima), assigned flights, and workload indicators.
- **Stand Allocation Board**: Interactive grid of 24 stands at Terminal 1, 2, and 3 Concourse A, B, and C with 1-click gate reassignment.
- **Delay Metrics**: Total delay minutes vs a First-Come-First-Served (FCFS) baseline and conflicts avoided.
- **Scenario Control Bar**: Trigger fog phases, adjust simulation speed (1x, 2x, 4x), or reset scenario.

---

## 4. Multi-Controller Ownership & Live Sync

Open multiple browser windows with different controllers:
- Ahmed (Arrivals North): `http://localhost:3000/?controller=CTRL-ARR-01`
- Sara (Arrivals South): `http://localhost:3000/?controller=CTRL-ARR-02`
- Tariq (Departures): `http://localhost:3000/?controller=CTRL-DEP-01`
- Overview Wall: `http://localhost:3000/?controller=ALL`

Each controller sees their assigned aircraft prominently while others are dimmed. When one controller issues a command or reassigns a stand, all other screens update in real time via WebSockets to prevent duplicate clearances.

---

## 5. Verification & Acceptance Tests

### Run Unit Tests
```bash
cd Honey_B/server
.venv/bin/pytest test_server.py
```

### Run 9-Step Pilot Integration Acceptance Test
Tests the full contract between the ground server and the pilot cockpit:
```bash
cd Honey_B/server
.venv/bin/python scripts/test_pilot_client.py
```
**The test verifies all 9 spec steps:**
1. Connect & receive snapshot for `UAE231`
2. Dense fog trigger & `weather.updated` event with LVP active
3. Server proposes controller action
4. Controller issues clearance & pilot receives `command.issued`
5. Pilot sends `WILCO` & ground marks `ACKNOWLEDGED`
6. Simulator executes command & broadcasts `EXECUTING`
7. Target altitude reached & command marked `DONE`
8. Stand reassignment & `stand.updated` delivered
9. Negative path: pilot `UNABLE` and `SUPERSEDED` clearances properly logged without false execution.

---

## 6. Shared Resources for Pilot Developer
- JSON Schemas: `Honey_B/shared/schema/*.json`
- Test Fixtures: `Honey_B/shared/fixtures/*.json`
- Interface Specification: `Honey_B_Ground_Hub_Interface_Spec.md`
