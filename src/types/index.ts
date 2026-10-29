// ============================================================
// SHARED DATA CONTRACT — ATC Pilot Dashboard
// This file is the integration boundary between the Pilot
// Dashboard and the Airport Control Centre system.
// Control centre team: POST/send objects matching these types
// via the mock API (see src/api/mockApi.ts).
// ============================================================

export type FlightPhase =
  | 'PREFLIGHT'
  | 'TAXI_OUT'
  | 'TAKEOFF'
  | 'CLIMB'
  | 'CRUISE'
  | 'DESCENT'
  | 'APPROACH'
  | 'HOLDING'
  | 'LANDING'
  | 'TAXI_IN'
  | 'ARRIVED';

export type ConnectionStatus = 'LIVE' | 'DELAYED' | 'DISCONNECTED';

export type SequenceStatus = 'CONFIRMED' | 'ESTIMATED';

export type RerouteStatus =
  | 'PROPOSED'
  | 'AWAITING_RESPONSE'
  | 'ACCEPTED_BY_PILOT'
  | 'CLEARED';

export type NoticeUrgency = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export type MessageStatus = 'UNREAD' | 'READ' | 'ACKNOWLEDGED';

export type PilotResponseType =
  | 'ACKNOWLEDGE'
  | 'UNABLE'
  | 'REQUEST_CLARIFICATION'
  | 'FUEL_CONCERN';

// ── Flight Core ─────────────────────────────────────────────

export interface FlightData {
  flightId: string;         // e.g. "EK201"
  callsign: string;
  origin: string;           // ICAO code
  destination: string;      // ICAO code
  phase: FlightPhase;
  altitudeFt: number;
  airspeedKts: number;
  groundspeedKts: number;
  remainingDistanceNm: number;
  plannedRoute: string;     // ICAO waypoints space-separated
  etaUtc: string;           // ISO 8601 UTC
  previousEtaUtc?: string;
  etaUpdatedAtUtc: string;  // when the ETA was last calculated
  etaChangeReasonCode?: string;
  etaChangeReasonText?: string;
  fuel: FuelData;
}

// ── Fuel ────────────────────────────────────────────────────

export interface FuelData {
  /** Aircraft-reported values (from ACARS/FMS, may be absent) */
  fuelOnBoardKg?: number;
  fuelFlowKgPerHr?: number;
  alternatesFuelKg?: number;
  finalReserveFuelKg?: number;
  /** Estimate derived fields — set by dashboard, not control centre */
  estimatedFuelAtArrivalKg?: number;
  fuelTrendAssumptions?: string;
  unavailableReason?: string;
}

// ── Landing Sequence ─────────────────────────────────────────

export interface LandingSequence {
  sequenceNumber: number;   // e.g. 3 = "3rd to land"
  totalInSequence: number;
  assignedRunway?: string;  // e.g. "30L"
  status: SequenceStatus;
  lastUpdatedUtc: string;
}

// ── Holding ──────────────────────────────────────────────────

export interface HoldingData {
  active: boolean;
  fix?: string;             // e.g. "IMPED"
  instructions?: string;   // e.g. "Hold NORTH, right turns, 1 min legs, FL150"
  efcUtc?: string;          // Expect Further Clearance time (UTC ISO 8601)
  predictedRemainingDelayMin?: number; // Decision-support only, not ATC instruction
  predictedDelayNote?: string;
}

// ── Reroute ──────────────────────────────────────────────────

export interface RerouteData {
  id: string;
  clearedRoute: string;
  proposedRoute?: string;
  proposedRouteReason?: string;
  proposedRouteDiff?: string;   // Human-readable diff
  estimatedTimeImpactMin?: number; // positive = longer, negative = shorter
  status: RerouteStatus;
  proposedAtUtc?: string;
  pilotResponseAtUtc?: string;
  atcClearedAtUtc?: string;
}

// ── Notices ──────────────────────────────────────────────────

export interface OperationalNotice {
  id: string;
  urgency: NoticeUrgency;
  category: 'RUNWAY' | 'WEATHER' | 'DELAY' | 'AIRSPACE' | 'STALE_DATA' | 'OTHER';
  title: string;
  body: string;
  effectiveUtc?: string;
  expiresUtc?: string;
  source: string;
  issuedAtUtc: string;
  isStale?: boolean;
}

// ── Arrival Conditions ───────────────────────────────────────

export interface ArrivalConditions {
  activeRunway: string;
  ilsApproach?: string;
  windDirectionDeg?: number;
  windSpeedKts?: number;
  gustKts?: number;
  visibilityMeters?: number;
  cloudBase?: string;        // e.g. "FEW 1500ft"
  temperatureCelsius?: number;
  dewpointCelsius?: number;
  qnh?: number;              // hPa
  notams?: string[];
  source: string;
  observedAtUtc: string;
}

// ── Messages ─────────────────────────────────────────────────

export interface DashboardMessage {
  id: string;
  flightId: string;
  source: 'ATC' | 'PILOT' | 'SYSTEM';
  timestampUtc: string;
  status: MessageStatus;
  acknowledgedAtUtc?: string;
  subject: string;
  body: string;
  requiresAck: boolean;
  pilotResponse?: PilotResponseType;
  pilotResponseAtUtc?: string;
  pilotResponseNote?: string;
}

// ── Full Dashboard State (what ATC sends us) ─────────────────

export interface DashboardState {
  connectionStatus: ConnectionStatus;
  connectionLastSeenUtc: string;
  dataVersion: number;
  generatedAtUtc: string;
  flight: FlightData;
  landingSequence: LandingSequence;
  holding: HoldingData;
  reroute?: RerouteData;
  notices: OperationalNotice[];
  arrivalConditions: ArrivalConditions;
  messages: DashboardMessage[];
}

// ── Demo Scenario Names ───────────────────────────────────────

export type ScenarioName =
  | 'NORMAL_ARRIVAL'
  | 'EXTENDED_HOLD'
  | 'PROPOSED_REROUTE'
  | 'RUNWAY_WEATHER_CHANGE'
  | 'LOST_CONNECTION';
