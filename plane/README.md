# FlightDeck AMS — Pilot In-Plane Application (`plane/`)

> **UAE Hackathon 2026 Prototype** · Pilot-Facing Arrival Management & Decision Support

---

## ⚠ Important Operational & Certification Disclaimer
**SIMULATION PROTOTYPE ONLY — NOT CERTIFIED AVIONICS.**
This application is an experimental decision-support prototype built for the UAE Hackathon 2026. It is **NOT** a certified flight management system, electronic flight bag (EFB), or source of air traffic clearance. All tactical clearances must be received via official air traffic control voice or certified CPDLC channels.

---

## Quick Start

### 1. From the `plane/` directory:
```bash
npm install
npm run dev
```

### 2. Or from the repository root:
```bash
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## Architecture & Dual Information Sources

The pilot interface combines and visually segregates two distinct sources of operational data:

| Information Source | Color Code & Badge | Key Parameters Shown |
|---|---|---|
| **Aircraft Avionics**<br>*(FMS, ADIRU, Fuel Sensors)* | Cyan / Slate<br>`SOURCE: AIRCRAFT (FMS / SENSORS)` | Flight ID, Callsign, Aircraft Type, WGS-84 Coordinates, Altitude & V/S, Indicated Airspeed & Groundspeed, True Heading, Operative Cleared Route, FMS ETA, Fuel on Board (FOB), Flow Rate, Alternate & Reserve Fuel. |
| **Ground Control Centre**<br>*(AMAN, ATC, ATIS)* | Emerald / Amber<br>`SOURCE: GROUND CONTROL (AMAN / ATC)` | Landing Sequence Number, Queue Depth, Assigned Runway, Target Landing Time (TLDT) & Delta from FMS, Holding Instructions & ATC EFC Time, Decision-Support Predicted Holding Delay, Proposed Tactical Reroutes, Airport METAR/ATIS Conditions, Operational Notices. |

Each data panel displays its originating source and the last-updated UTC timestamp.

---

## Safety Guardrails Encoded in the Pilot UI

1. **Prediction vs. Instruction**:
   - An ATC holding instruction includes an operative **Expect Further Clearance (EFC)** time.
   - The AMAN **predicted delay** (e.g., `~48 min`) is displayed in an isolated card explicitly labeled:
     `⚠ DECISION SUPPORT ONLY — NOT AN ATC CLEARANCE`.
2. **Proposed Reroute vs. Cleared Route**:
   - Proposed reroutes are shown side-by-side with the current cleared route, highlighting the waypoint difference, ground reason, and time impact.
   - When the pilot clicks `✓ Pilot Accepts (Advisory Intent)`, status changes to `ACCEPTED_BY_PILOT`. **The operative cleared route is NEVER automatically altered**. The pilot must await formal ATC clearance before reprogramming navigation.
3. **Deterministic Missing Data**:
   - If aircraft fuel sensors are offline or unavailable, the system displays `FUEL DATA UNAVAILABLE` with instructions to consult the manual fuel log, rather than guessing or fabricating numbers.
4. **Datalink Health & Stale State**:
   - `LIVE`: Ground updates active (<30s).
   - `DELAYED`: Ground updates lagging (30s – 120s), amber advisory banner.
   - `DISCONNECTED`: Link lost (>120s), red alert banner with instruction to revert to primary VHF voice frequency (127.425 MHz).

---

## Pilot Workflows & Views

### 1. Default View: Honey B Single-Glance Cockpit Tablet Overview
Designed for high-stress arrival environments as a calm, high-contrast cockpit tablet display:
- **Tablet Header**: Honey B bee insignia, flight identity (`EK201`, `OMDB → EGLL`), datalink health status, and age of last ground update.
- **Priority-Sorted Operational Stream**:
  1. *Landing Sequence* (e.g., `#4 in Sequence · 11 in Stream · Est. 14:48Z`) with runway alignment graphic.
  2. *Holding Advisory & Delay* (e.g., `Hold at LAM · EFC 15:10Z · AMAN Delay ~48m`) with holding racetrack diagram and non-clearance advisory tag.
  3. *ETA & Touchdown Impact* (e.g., `EGLL 14:48Z (+18m vs FMS) · Target 14:48Z`) with clock delta graphic.
  4. *Proposed Tactical Reroute* (e.g., `Via BIG DCT EGLL · +4m · TMA Sequencing`) with diverging waypoint diagram.
  5. *Urgent Operational Notice* (e.g., `Runway 27R CLSD · Snow Clearance in Progress`) with high-contrast warning badge.
- **Secondary Suggested Reply Buttons**:
  - Contextual one-tap responses (e.g., `((•)) "Wilco, entering hold LAM" ›`, `((•)) "Unable reroute — fuel minimums" ›`).
  - Opens the **Suggested Reply Review Modal** requiring explicit pilot confirmation and notes before downlinking (disclaiming that downlinks are advisory intent, not ATC clearances).
- **Persistent Bottom Dock**:
  - Four persistent at-a-glance values: `FUEL (14.2t / 2h 45m)`, `CURRENT ETA (14:48Z)`, `ASSIGNED RUNWAY (27L)`, and `ARRIVAL PRIORITY (#4 / MED)`.
- **Deep-Dive Cross-Linking**:
  - Tapping any priority card or bottom strip metric instantly scrolls down to the corresponding detailed system card with a pulsing target highlight.

### 2. Detailed Cockpit Screens (Accessible below or via tab toggle)
1. **Arrival & Sequencing Overview**: Real-time position in the arrival stream (#4/11), assigned runway, countdown, holding status with ATC EFC vs. AMAN predicted delay, and FMS vs. TLDT delta comparison.
2. **Tactical Reroute Review**: Side-by-side route inspection, diff, time impact (+/- min), and pilot advisory response options (`Accept` / `Unable`).
3. **Operational Notices**: Filtered and sorted strictly by urgency (`CRITICAL` → `HIGH` → `MEDIUM` → `LOW` → `INFO`) with clear text tags and distinct colors.
4. **Fuel & Delay Impact**: Visual endurance bar, fuel at touchdown factoring holding burn, and fuel concern thresholds.
5. **Runway & Weather Awareness**: Active runway, low-visibility/windshear alerts, runway change notices, and ATIS observations.
6. **Air-Ground Two-Way Comms**: Acknowledge instructions, send `Unable`, request clarification with custom pilot notes, or flag `Fuel Concern`.

---

## Demo Scenarios

Switch scenarios at any time via the top bar:
- **Normal Arrival**: Nominal descent into EGLL, sequence #4/11, minor rain.
- **Extended Hold**: Runway closure at EGLL, holding at LAM, 48 min predicted delay, fuel concern.
- **Proposed Reroute**: Tactical proposal via BIG DCT EGLL (+4 min) for TMA sequencing.
- **Runway / Weather Change**: Active runway shifted from 27R to 09L, wind shear reported, CAT II ILS.
- **Lost Connection**: Datalink lost 22 min ago, degraded communication warning.

---

## Clean Adapter Pattern (`src/services/dataLinkAdapter.ts`)

The pilot prototype communicates exclusively through the `DataLinkAdapter` interface:
```typescript
export interface DataLinkAdapter {
  subscribe(onStateUpdate: (state: ConsolidatedDashboardState) => void): () => void;
  sendPilotResponse(payload: PilotResponsePayload): Promise<{ success: boolean; transmissionId: string }>;
  setScenario(name: ScenarioName): Promise<void>;
  getConnectionStatus(): ConnectionStatus;
  pilotAcceptReroute(rerouteId: string): void;
  pilotUnableReroute(rerouteId: string): void;
}
```
To connect to the Ground Control application, replace `MockDataLinkAdapter` with `HttpDataLinkAdapter` or `WebSocketDataLinkAdapter`.
