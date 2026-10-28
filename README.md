# Honey B — Air-Ground Arrival Management System

> **UAE Hackathon 2026** · Collaborative Arrival Management Prototype

---

### ⚠ Operational Disclaimer & Safety Notice
**SIMULATION PROTOTYPE ONLY — NOT CERTIFIED AVIONICS.**
This repository contains a prototype decision-support system developed for the UAE Hackathon 2026. It is **NOT** certified avionics and does **NOT** provide official air traffic clearances. All data is simulated for demonstration purposes.

---

## Repository Structure

The repository is organized around two primary program folders:

```
Honey_B/
├── CONTRACT.md                 ← Versioned Air-Ground Integration Contract (v1.0.0)
├── integration-contract.ts     ← Shared TypeScript types & envelopes
├── integration-contract.json   ← JSON Schema for contract validation
├── README.md                   ← Root documentation & integration guide
│
├── plane/                      ← Pilot-Facing In-Plane System (Prototype)
│   ├── package.json
│   ├── src/
│   │   ├── types/index.ts      ← Dual-source data models
│   │   ├── services/
│   │   │   └── dataLinkAdapter.ts ← Clean transport adapter (Mock / HTTP / WS)
│   │   ├── components/         ← Cockpit cards, overview, comms, notices
│   │   ├── App.tsx             ← Master pilot interface & scenario orchestration
│   │   └── index.css           ← Dark cockpit design system
│   └── README.md
│
└── ground-control/             ← Airport Control Centre System (Partner Workspace)
    └── README.md               ← Partner setup & integration instructions
```

---

## 1. How to Run the Pilot Prototype (`plane/`)

### Option A: From the repository root
```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### Option B: From inside the `plane/` directory
```bash
cd plane
npm install
npm run dev
```

Open **`http://localhost:5173`** in your browser.

### Available Demo Scenarios
Switch scenarios using the interactive selector bar at the top of the screen:
1. **Normal Arrival**: Standard descent into EGLL, sequence position #4/11, minor rain at destination, active datalink.
2. **Extended Hold**: Ground stop at EGLL due to blocked runway, active hold at LAM, 48 min predicted delay, fuel concern advisory.
3. **Proposed Reroute**: Tactical reroute proposal via BIG DCT EGLL (+4 min) for TMA sequencing; awaiting pilot advisory response.
4. **Runway / Weather Change**: Active runway shifted from 27R to 09L, severe wind shear reported, CAT II ILS operations, low visibility.
5. **Lost Connection**: CPDLC datalink lost 22 minutes ago; stale data banners active, pilot alerted to revert to VHF voice comms.

---

## 2. Honey B Cockpit Views: Single-Glance Overview & Detailed Screens

The pilot interface opens by default into the **Honey B Cockpit Tablet Overview**:
- **Tablet Header**: Flight identity chip (`EK201` `OMDB → EGLL`), datalink indicator, and time elapsed since last ground message.
- **Top 5 Priority Items**: Sequence position, holding advisory & delay, ETA changes, proposed reroute, and operational notices with clear plain-language summaries and runway/racetrack/reroute vector diagrams.
- **Secondary Suggested Reply Buttons**: Direct one-tap responses (e.g. `((•)) "Wilco, entering hold LAM" ›`) triggering an explicit pilot review and confirmation modal.
- **Persistent Bottom Dock**: Fuel endurance, destination ETA, assigned runway, and arrival priority metrics.
- **Detailed Screens**: Easily accessible below the tablet or through the toggle button for deep-dive telemetry, fuel burn graphs, waypoint diffs, and ATIS conditions. Tapping any overview card smoothly scrolls directly to its corresponding detailed screen.

---

## 3. Integration Guide for Ground-Control Partner

The airport control centre system (`ground-control/`) connects to the pilot system (`plane/`) via the shared integration contract:
- **Full Specification:** [`CONTRACT.md`](./CONTRACT.md)
- **TypeScript Schemas:** [`integration-contract.ts`](./integration-contract.ts)
- **JSON Validation Schema:** [`integration-contract.json`](./integration-contract.json)

### Connecting Ground Control to the Pilot Interface

The pilot application uses a pluggable adapter pattern located at [`plane/src/services/dataLinkAdapter.ts`](./plane/src/services/dataLinkAdapter.ts).

#### Step 1: Supply Ground Updates (Ground-to-Air / G2A)
Your ground control centre application can transmit updates via REST or WebSocket:

- **REST Polling Endpoint:**
  Expose `GET /api/dashboard/{flightId}` returning a `ConsolidatedDashboardState` JSON document:
  ```json
  {
    "contractVersion": "1.0.0",
    "flightId": "EK201",
    "connectionStatus": "LIVE",
    "connectionLastSeenUtc": "2026-10-28T14:30:00.000Z",
    "revision": 1,
    "generatedAtUtc": "2026-10-28T14:30:00.000Z",
    "aircraft": { ... },
    "landingSequence": { ... },
    "holding": { ... },
    "reroute": { ... },
    "conditions": { ... },
    "notices": [ ... ],
    "messages": [ ... ]
  }
  ```

- **WebSocket Stream:**
  Broadcast state updates on `ws://your-host:port/datalink/{flightId}`.

#### Step 2: Ingest Pilot Responses (Air-to-Ground / A2G)
When the pilot clicks **Acknowledge**, **Unable**, **Request Clarification**, or **Fuel Concern**, the pilot interface downlinks an envelope to:

```http
POST /api/pilot-response
Content-Type: application/json

{
  "referencedMessageId": "MSG-G2A-20261028-3042",
  "flightId": "EK201",
  "responseType": "FUEL_CONCERN",
  "pilotNotes": "Holding endurance 28 min before reserve infringement.",
  "timestampUtc": "2026-10-28T14:30:15.000Z"
}
```

#### Step 3: Activate the Live Adapter
In `plane/src/services/dataLinkAdapter.ts`, switch the active adapter export:

```typescript
// Replace:
export const activeDataLinkAdapter: DataLinkAdapter = new MockDataLinkAdapter();

// With:
export const activeDataLinkAdapter: DataLinkAdapter = new HttpDataLinkAdapter('http://localhost:8080', 'EK201');
```

---

## 4. Key Safety Rules Encoded in the Pilot UI

1. **Prediction vs. Instruction**:
   - Holding instructions include an operative **Expect Further Clearance (EFC)** time.
   - AMAN **predicted delay** (e.g., `~48 min`) is strictly labeled as **decision-support only** and is **never** presented as an air traffic clearance.
2. **Proposed Reroute vs. Cleared Route**:
   - Proposed reroutes are reviewed alongside the cleared route with diff, reason, and time impact.
   - When the pilot acknowledges or accepts a proposed reroute, status is set to `ACCEPTED_BY_PILOT` (advisory intent). **The cleared route is NEVER automatically changed**. Operative routing only updates when formal clearance is issued.
3. **Deterministic Missing Data**:
   - When aircraft fuel data is absent, the interface displays **"unavailable"** rather than fabricating an endurance figure.
4. **Datalink Status**:
   - Clearly differentiates `LIVE`, `DELAYED`, and `DISCONNECTED` states. If updates stop arriving, stale indicators activate and crew is instructed to revert to VHF voice comms.
5. **Touch-Safety & Ergonomic Pilot Controls**:
   - **Generous Spacing & Cushion Zones**: "Accept" and "Unable" buttons are physically and visually isolated with inactive buffer zones between them to prevent accidental dual-touches or slip activation in turbulence.
   - **Edge Clearance**: Critical buttons are placed away from screen edges and tablet bezel holding areas.
   - **Deliberate Dwell Rejection**: Accidental surface grazes (<120ms) are filtered out, while rapid duplicate activations within a 450ms refractory window are debounced.
   - **1.0s Consequential Press-and-Hold**: Simulated clearance responses require an unbroken 1.0s hold with visible linear/circular progress, immediately aborted if the finger slips (>14px), touch is interrupted, or message state changes.
   - **Reusable Slide-to-Confirm**: Reusable slider component (`SlideToConfirm.tsx`) for future runway/takeoff flows with 85% drag threshold and auto spring-back.
   - **Device Support Dependencies**: Palm/oversized contact patch rejection checks require hardware/OS digitizer reporting (`PointerEvent.width/height` or `Touch.radiusX/radiusY`), supported on iPadOS, Android tablets, and Windows Pen. On mouse inputs, contact size defaults gracefully without blocking valid clicks.

---

## 5. Technology Stack

- **Framework:** React 19 + TypeScript (Vite)
- **Styling:** Cockpit-grade Vanilla CSS with custom properties design system
- **Typography:** Google Fonts (Inter, JetBrains Mono, Rajdhani)
- **Dependencies:** Zero external UI component libraries (pure native DOM)

---

*UAE Hackathon 2026 · Team: Pilot In-Plane System (`plane/`) + Airport Control Centre (`ground-control/`)*
