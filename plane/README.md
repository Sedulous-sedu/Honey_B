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
5. **Touch-Safety & Ergonomic Pilot Controls**:
   - **Large Touch Targets & Safety Spacing**: Minimum 52px target height with generous cushions. "Accept" and "Unable" are placed far apart with an inactive physical buffer zone between them to prevent fat-finger or turbulence accidents.
   - **Edge Clearance & Hand-Rest Area Protection**: Critical actions are kept well away from tablet display edges and bottom corners where pilots rest their palms while holding the device.
   - **Accidental Touch Rejection (Graze vs. Deliberate Tap)**: Requires a deliberate dwell (>120ms); quick surface grazes or brush contacts are discarded with immediate visual alerts.
   - **Duplicate Activation Shield**: Suppresses rapid duplicate activations within a 450ms refractory window while preserving distinctly timed intentional inputs.
   - **1.0-Second Consequential Press-and-Hold**: Simulated clearance responses (e.g., tactical reroute advisory acceptance, downlink transmission) require an unbroken 1.0s hold with visible real-time circular and linear progress. Automatically cancelled if the finger slips off (>14px), touch is interrupted, or if the underlying message/proposal revision updates during the hold.
   - **Reusable Slide-to-Confirm Component** (`SlideToConfirm.tsx`): Built for future runway crossing or takeoff flows, requiring smooth dragging past an 85% threshold with auto spring-back and palm rejection.
   - **Device Support Dependencies**:
     - *Universal (works on all devices/browsers)*: 1.0s press-and-hold progress, slip-off cancellation, dwell timing, duplicate tap debouncing, state-change integrity abortion.
     - *Device-Dependent (requires hardware/OS digitizer support)*: Palm / oversized contact patch rejection evaluates `PointerEvent.width/height` or `Touch.radiusX/radiusY`. This is supported on iPadOS, Android tablets, and Windows Pen digitizers. On desktop mouse inputs or emulators reporting unit contact geometry (1px), contact patch checks safely pass without blocking valid inputs.
   - **Vocabulary Precision**: "Acknowledge" is strictly used for informational updates; "Accept" is exclusively reserved for proposals. "Unable" and "Request Clarification" remain instantly reachable without arduous holds.

---

## Pilot Workflows & Views

### 1. Default View: Simplified Cockpit Tablet Overview (Usable at a Glance Without Scrolling)
Engineered specifically for calm, high-stress arrival management on a cockpit tablet screen without scrolling:

- **Area 1: Compact Header**:
  - Flight identification chip (`EK201`, `OMDB → EGLL`, `A388`).
  - Datalink health status pill (`LIVE` / `DELAYED` / `DISCONNECTED`) with real-time age of latest ground update (`12s ago`).
  - Obvious one-tap deep navigation buttons:
    - `[📋 Updates]` (with badge count of active messages & notices).
    - `[✈ Flight Status]` (immediate access to deep avionics, fuel, weather, and reroute diffs).

- **Conditional Urgent Notice (Rendered Only When One Exists)**:
  - If a critical notice exists (e.g., `RUNWAY 27R CLSD — Snow Clearance`), datalink is lost, or a runway reversal occurs, a high-contrast amber/red warning banner appears with a direct link to details.
  - If no urgent condition exists, this area is completely hidden to eliminate clutter.

- **Area 2: Main Operational Card**:
  - **One Clear Sentence**: Displays ONLY the single latest operative instruction or proposal in crystal-clear natural language (e.g., *"Cleared for standard arrival into London Heathrow, number 4 in sequence for Runway 27R"* or *"ATC proposes tactical reroute via BIG DCT EGLL (+4 min) for arrival spacing"*).
  - Explicit metadata: originating ground source (`SOURCE: GROUND CONTROL`) and issued UTC timestamp.
  - **Protected Pilot Actions**:
    - Large, widely separated **“Acknowledge”** and **“Unable”** action controls (minimum 56px height).
    - Separated by an inactive physical cushion buffer zone (`SAFETY SEPARATION`) to eliminate accidental cross-touches in turbulence.
    - Protected by deliberate dwell (>120ms) and duplicate debounce shielding (450ms).
    - Consequential reroute acceptance protected by a 1.0s Press-and-Hold with visible progress.

- **Area 3: Four Large Arrival Summary Values**:
  1. **Landing Sequence**: e.g., `#4 of 11` (with AMAN status).
  2. **Holding Status**: e.g., `None` or `15:10Z` (EFC Time). If no further-clearance time is supplied, strictly displays **"Awaiting further clearance"** rather than showing a countdown.
  3. **Destination ETA**: e.g., `14:48Z` (with delay delta `+18m vs FMS`).
  4. **Assigned Runway**: e.g., `27L` (with approach type and wind).

- **One-Tap Access to Deep Cockpit Screens**:
  - Detailed flight systems, fuel endurance, waypoint diffs, and ATIS conditions are accessible via the header's `[Updates]` and `[Flight Status]` buttons.
  - A prominent `[◀ Back to Single-Glance Overview]` button returns to the first screen in one tap.

### 2. Detailed Cockpit Screens (Accessible via One-Tap Navigation)
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
