# Air-Ground Integration Contract (Version 1.0.0)

> **UAE Hackathon 2026** · Shared Data Interface between `plane/` (Pilot In-Plane System) and `ground-control/` (Airport Control Centre)

---

## 1. Overview & Architectural Boundaries

This contract defines the authoritative communication specification between:
- **`plane/`**: The pilot-facing cockpit decision-support arrival management application.
- **`ground-control/`**: The airport control centre arrival sequencing and air traffic management system.

### Core Safety & Operational Principles
1. **Source Separation**: Every data item must clearly originate from either `AIRCRAFT` (avionics/FMS/sensors) or `GROUND_CONTROL` (ATC/AMAN/ATIS).
2. **Instruction vs. Prediction**:
   - An **instruction/clearance** (e.g., ATC-issued EFC time or holding fix) is an operative command.
   - A **prediction** (e.g., ground-predicted holding delay in minutes) is purely decision support and is **NEVER** an air traffic clearance.
3. **Route Integrity**: A **proposed reroute** is never active until formal ATC route clearance is issued. Pilot advisory acceptance transmits intent (`ACCEPTED_BY_PILOT`) but **never automatically alters the operative cleared route**.
4. **Deterministic Missing Data**: When aircraft fuel or telemetry inputs are unavailable, fields MUST be omitted or set to `null`/explicit reason; systems must display **"unavailable"** rather than fabricating estimates.
5. **Datalink Health**: Updates are timestamped in UTC. If ground updates cease for >30 seconds, the link is `DELAYED`; if >120 seconds, the link is `DISCONNECTED`, warning crew to revert to VHF voice comms.

---

## 2. Standardized Units of Measurement

All messages must strictly adhere to the following physical units:

| Dimension | Unit | Symbol | Format / Range |
|---|---|---|---|
| **Time** | Coordinated Universal Time | UTC | ISO 8601 string: `YYYY-MM-DDTHH:mm:ss.sssZ` |
| **Altitude** | Feet above Mean Sea Level | ft | Integer (e.g., `18000`) |
| **Airspeed / Groundspeed** | Knots | kts | Integer (e.g., `310`, `425`) |
| **Distance** | Nautical Miles | NM | Decimal (e.g., `84.5`) |
| **Heading / Course** | Degrees True | deg | Integer `001` to `360` |
| **Coordinates** | Decimal Degrees | deg | WGS-84 (e.g., `lat: 51.4700, lon: -0.4543`) |
| **Fuel Quantity** | Kilograms | kg | Integer (e.g., `14200`) |
| **Fuel Flow Rate** | Kilograms per Hour | kg/hr | Integer (e.g., `5800`) |
| **Atmospheric Pressure** | Hectopascals | hPa | Integer (e.g., `1013`) |
| **Visibility** | Meters | m | Integer (e.g., `8000`) |
| **Temperature** | Degrees Celsius | °C | Integer (e.g., `8`) |
| **Duration / Delay** | Minutes | min | Integer (e.g., `48`) |

---

## 3. Universal Message Envelope

Every discrete message transferred between air and ground carries this standard envelope:

```typescript
export interface MessageEnvelope<T = unknown> {
  contractVersion: "1.0.0";
  messageId: string;              // Unique message identifier (e.g., "MSG-20261028-0042")
  flightId: string;               // Commercial flight number / callsign (e.g., "EK201")
  source: "AIRCRAFT" | "GROUND_CONTROL";
  revision: number;               // Monotonically increasing revision sequence number
  timestampUtc: string;           // ISO 8601 UTC timestamp
  acknowledgmentState:
    | "NONE"
    | "REQUIRED"
    | "ACKNOWLEDGED"
    | "UNABLE"
    | "CLARIFICATION_REQUESTED"
    | "FUEL_CONCERN";
  payloadType: string;
  payload: T;
}
```

---

## 4. Aircraft-to-Ground (A2G) Message Types

### 4.1 `AIRCRAFT_TELEMETRY`
Downlinked periodically by the aircraft's Flight Management System (FMS) and navigation avionics.

```typescript
export interface AircraftTelemetryPayload {
  flightId: string;
  callsign: string;
  aircraftType: string;           // ICAO code, e.g., "A388", "B77W"
  originIcao: string;             // e.g., "OMDB"
  destinationIcao: string;        // e.g., "EGLL"
  flightPhase: "CLIMB" | "CRUISE" | "DESCENT" | "APPROACH" | "HOLDING" | "LANDING";
  
  // Position & Dynamics
  position: {
    latitude: number;             // WGS84 decimal degrees
    longitude: number;
    remainingDistanceNm: number;
    headingDegTrue: number;       // 1-360
  };
  altitudeFt: number;
  indicatedAirspeedKts: number;
  groundspeedKts: number;
  mach?: number;
  
  // Routing & Time
  currentClearedRoute: string;    // Space-separated waypoints
  fmsEtaUtc: string;              // Aircraft FMS autonomous ETA
  fmsEtaCalculatedAtUtc: string;
  
  // Fuel Data (Optional / May be unavailable if sensors fail)
  fuel?: {
    fuelOnBoardKg: number;
    fuelFlowKgPerHr: number;
    alternatesFuelKg: number;
    finalReserveFuelKg: number;
    estimatedFuelAtArrivalKg?: number;
    unavailableReason?: string;
  };
}
```

### 4.2 `PILOT_RESPONSE`
Transmitted by the pilot in response to ATC clearances, proposed reroutes, or ground operational notices.

```typescript
export interface PilotResponsePayload {
  referencedMessageId: string;    // ID of ground message being answered
  flightId: string;
  responseType:
    | "ACKNOWLEDGE"               // Pilot acknowledged receipt/advisory
    | "UNABLE"                    // Pilot unable to comply (current route remains active)
    | "REQUEST_CLARIFICATION"     // Pilot requires verbal/written elaboration
    | "FUEL_CONCERN";             // Pilot flagged delay/holding exceeds safe fuel margins
  pilotNotes?: string;            // Free-text remark from pilot
  timestampUtc: string;
}
```

---

## 5. Ground-to-Aircraft (G2A) Message Types

### 5.1 `ARRIVAL_SEQUENCE_UPDATE`
Generated by the Arrival Management (AMAN) system at the airport control centre.

```typescript
export interface ArrivalSequencePayload {
  sequenceNumber: number;         // Current landing order (e.g., 4)
  totalInSequence: number;        // Total arrival traffic in queue (e.g., 11)
  assignedRunway?: string;        // e.g., "27R" (absent if sequence estimated)
  status: "CONFIRMED" | "ESTIMATED";
  targetLandingTimeUtc: string;   // AMAN computed landing timestamp
  delayMinutes: number;           // Calculated spacing delay
  lastUpdatedUtc: string;
}
```

### 5.2 `HOLDING_INSTRUCTION`
Issued when terminal airspace congestion requires holding.

```typescript
export interface HoldingInstructionPayload {
  active: boolean;
  fix?: string;                   // Holding waypoint, e.g., "LAM"
  inboundTrackDeg?: number;       // Inbound course
  turnDirection?: "LEFT" | "RIGHT";
  legDurationMin?: number;        // e.g., 1 min
  assignedAltitudeFt?: number;    // e.g., 15000 (FL150)
  
  // ATC CLEARANCE FIELD
  efcUtc?: string;                // Expect Further Clearance (MANDATORY if holding)
  
  // DECISION SUPPORT PREDICTION FIELD (NOT AN ATC CLEARANCE)
  predictedDelayMinutes?: number; // AMAN estimated hold time (e.g., 48)
  predictedDelayDisclaimer: "DECISION SUPPORT ONLY — NOT AN ATC CLEARANCE";
  predictionReason?: string;
  lastUpdatedUtc: string;
}
```

### 5.3 `PROPOSED_REROUTE`
Tactical reroute proposal formulated by ground control for traffic sequencing.

```typescript
export interface ProposedReroutePayload {
  rerouteId: string;
  currentClearedRoute: string;    // Active operative route
  proposedRoute: string;          // Suggested alternative routing
  reason: string;                 // e.g., "Sequencing & spacing for London TMA"
  routeDiff: string;              // Human-readable change summary (e.g., "KENET -> BIG DCT EGLL")
  estimatedTimeImpactMinutes: number; // Positive = longer (+4 min), Negative = shorter
  status:
    | "PROPOSED"                  // Published by Ground
    | "AWAITING_RESPONSE"         // Transmitted to pilot, awaiting response
    | "ACCEPTED_BY_PILOT"         // Pilot advisory acceptance (NOT YET CLEARED)
    | "CLEARED";                  // Formal ATC clearance issued
  proposedAtUtc: string;
  pilotResponseAtUtc?: string;
  atcClearedAtUtc?: string;
}
```

### 5.4 `AIRPORT_CONDITIONS_UPDATE`
Current airport surface and meteorological conditions.

```typescript
export interface AirportConditionsPayload {
  airportIcao: string;            // e.g., "EGLL"
  activeRunway: string;           // e.g., "27R" or "09L"
  approachType: string;           // e.g., "ILS Z RWY 27R", "CAT II ILS"
  surfaceConditionCode?: string;  // e.g., "WET - GOOD"
  windDirectionDeg?: number;      // e.g., 260
  windSpeedKts?: number;          // e.g., 12
  gustKts?: number;               // e.g., 22
  visibilityMeters?: number;      // e.g., 8000
  cloudBase: string;              // e.g., "BKN 1800ft"
  temperatureC?: number;
  dewpointC?: number;
  qnhHpa: number;                 // e.g., 1013
  notams: string[];
  source: string;                 // e.g., "EGLL ATIS INFO D"
  observedAtUtc: string;
}
```

### 5.5 `OPERATIONAL_NOTICE`
Safety and tactical notices sorted strictly by urgency.

```typescript
export interface OperationalNoticePayload {
  noticeId: string;
  urgency: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  category: "RUNWAY" | "WEATHER" | "DELAY" | "AIRSPACE" | "SYSTEM" | "OTHER";
  title: string;
  body: string;
  effectiveUtc?: string;
  expiresUtc?: string;
  source: string;                 // e.g., "LONDON TMA SUPERVISOR"
  issuedAtUtc: string;
  isStale?: boolean;
}
```

### 5.6 `COMPREHENSIVE_DASHBOARD_STATE`
Aggregated state broadcast by ground control to populate the complete pilot interface in one atomic frame.

```typescript
export interface GroundDashboardBroadcast {
  contractVersion: "1.0.0";
  flightId: string;
  connectionStatus: "LIVE" | "DELAYED" | "DISCONNECTED";
  connectionLastSeenUtc: string;
  revision: number;
  generatedAtUtc: string;
  sequence: ArrivalSequencePayload;
  holding: HoldingInstructionPayload;
  reroute?: ProposedReroutePayload;
  conditions: AirportConditionsPayload;
  notices: OperationalNoticePayload[];
  messages: Array<MessageEnvelope<unknown>>;
}
```

---

## 6. Concrete Example Payloads

### Example 1: Aircraft Telemetry Downlink (`A2G`)
```json
{
  "contractVersion": "1.0.0",
  "messageId": "MSG-A2G-20261028-1001",
  "flightId": "EK201",
  "source": "AIRCRAFT",
  "revision": 142,
  "timestampUtc": "2026-10-28T14:24:00.000Z",
  "acknowledgmentState": "NONE",
  "payloadType": "AIRCRAFT_TELEMETRY",
  "payload": {
    "flightId": "EK201",
    "callsign": "EMIRATES 201",
    "aircraftType": "A388",
    "originIcao": "OMDB",
    "destinationIcao": "EGLL",
    "flightPhase": "DESCENT",
    "position": {
      "latitude": 51.4700,
      "longitude": -0.4543,
      "remainingDistanceNm": 84,
      "headingDegTrue": 268
    },
    "altitudeFt": 18000,
    "indicatedAirspeedKts": 310,
    "groundspeedKts": 425,
    "mach": 0.78,
    "currentClearedRoute": "OMDB RASVO UM728 BEVAV UL613 KENET EGLL",
    "fmsEtaUtc": "2026-10-28T14:48:00.000Z",
    "fmsEtaCalculatedAtUtc": "2026-10-28T14:23:45.000Z",
    "fuel": {
      "fuelOnBoardKg": 14200,
      "fuelFlowKgPerHr": 5800,
      "alternatesFuelKg": 3100,
      "finalReserveFuelKg": 2200,
      "estimatedFuelAtArrivalKg": 12380
    }
  }
}
```

### Example 2: Ground AMAN Sequence & Holding Uplink (`G2A`)
```json
{
  "contractVersion": "1.0.0",
  "messageId": "MSG-G2A-20261028-3042",
  "flightId": "EK201",
  "source": "GROUND_CONTROL",
  "revision": 71,
  "timestampUtc": "2026-10-28T14:25:30.000Z",
  "acknowledgmentState": "REQUIRED",
  "payloadType": "HOLDING_INSTRUCTION",
  "payload": {
    "active": true,
    "fix": "LAM",
    "inboundTrackDeg": 270,
    "turnDirection": "RIGHT",
    "legDurationMin": 1,
    "assignedAltitudeFt": 15000,
    "efcUtc": "2026-10-28T15:15:00.000Z",
    "predictedDelayMinutes": 48,
    "predictedDelayDisclaimer": "DECISION SUPPORT ONLY — NOT AN ATC CLEARANCE",
    "predictionReason": "Ground stop at EGLL due to disabled aircraft on runway 27L.",
    "lastUpdatedUtc": "2026-10-28T14:25:10.000Z"
  }
}
```

### Example 3: Pilot Response Uplink (`A2G`)
```json
{
  "contractVersion": "1.0.0",
  "messageId": "MSG-A2G-20261028-1002",
  "flightId": "EK201",
  "source": "AIRCRAFT",
  "revision": 143,
  "timestampUtc": "2026-10-28T14:26:15.000Z",
  "acknowledgmentState": "FUEL_CONCERN",
  "payloadType": "PILOT_RESPONSE",
  "payload": {
    "referencedMessageId": "MSG-G2A-20261028-3042",
    "flightId": "EK201",
    "responseType": "FUEL_CONCERN",
    "pilotNotes": "Holding endurance 38 minutes before reserve fuel infringement. Request priority or diversion clearance if delay exceeds 35 min.",
    "timestampUtc": "2026-10-28T14:26:15.000Z"
  }
}
```

---

## 7. Versioning & Evolution

- Contract modifications follow Semantic Versioning (`MAJOR.MINOR.PATCH`).
- Additive changes (optional fields) increment `MINOR`.
- Breaking changes (field removals or unit modifications) increment `MAJOR`.
- Both applications MUST reject messages where `contractVersion` does not start with `"1."`.
