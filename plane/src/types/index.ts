/**
 * ==============================================================================
 * FLIGHTDECK AMS — PILOT SYSTEM TYPES & INTEGRATION CONTRACT
 * ==============================================================================
 * Conforms to root CONTRACT.md (Version 1.0.0).
 * Clearly separates data originated by AIRCRAFT avionics from data originated
 * by GROUND CONTROL (AMAN / ATC / ATIS).
 * ==============================================================================
 */

export const CONTRACT_VERSION = '1.0.0' as const;

export type DataSource = 'AIRCRAFT' | 'GROUND_CONTROL';

export type ConnectionStatus = 'LIVE' | 'DELAYED' | 'DISCONNECTED';

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

export type SequenceStatus = 'CONFIRMED' | 'ESTIMATED';

export type RerouteStatus =
  | 'PROPOSED'
  | 'AWAITING_RESPONSE'
  | 'ACCEPTED_BY_PILOT'
  | 'CLEARED';

export type NoticeUrgency = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export type NoticeCategory =
  | 'RUNWAY'
  | 'WEATHER'
  | 'DELAY'
  | 'AIRSPACE'
  | 'SYSTEM'
  | 'OTHER';

export type PilotResponseType =
  | 'ACKNOWLEDGE'
  | 'UNABLE'
  | 'REQUEST_CLARIFICATION'
  | 'FUEL_CONCERN';

// ── 1. Aircraft-Originated Data (FMS / ADIRU / Avionics) ─────

export interface AircraftPosition {
  latitude: number;
  longitude: number;
  formattedCoordinates: string; // e.g. "51°28'12\"N 000°27'48\"W"
  remainingDistanceNm: number;
  headingDegTrue: number;
}

export interface AircraftFuelData {
  /** Aircraft-reported values from ACARS / FMS sensors */
  fuelOnBoardKg?: number;
  fuelFlowKgPerHr?: number;
  alternatesFuelKg?: number;
  finalReserveFuelKg?: number;
  /** Estimated fuel remaining at touchdown */
  estimatedFuelAtArrivalKg?: number;
  holdingEnduranceMinutes?: number;
  fuelTrendAssumptions?: string;
  unavailableReason?: string;
}

export interface AircraftData {
  flightId: string;               // e.g. "EK201"
  callsign: string;               // e.g. "EMIRATES 201"
  aircraftType: string;           // e.g. "A388"
  originIcao: string;             // e.g. "OMDB"
  destinationIcao: string;        // e.g. "EGLL"
  flightPhase: FlightPhase;
  altitudeFt: number;
  verticalSpeedFpm: number;
  indicatedAirspeedKts: number;
  groundspeedKts: number;
  mach: number;
  position: AircraftPosition;
  currentClearedRoute: string;    // Operative FMS route
  fmsEtaUtc: string;              // Aircraft autonomous ETA
  fmsEtaCalculatedAtUtc: string;
  fuel: AircraftFuelData;
  source: 'AIRCRAFT';
  lastUpdatedUtc: string;
}

// ── 2. Ground-Control-Originated Data (AMAN / ATC / ATIS) ────

export interface GroundLandingSequence {
  sequenceNumber: number;         // e.g. 4
  totalInSequence: number;        // e.g. 11
  assignedRunway?: string;        // e.g. "27R" (or undefined if pending)
  status: SequenceStatus;
  targetLandingTimeUtc: string;   // AMAN TLDT
  delayMinutes: number;           // Calculated spacing delay
  previousTargetLandingTimeUtc?: string;
  delayReasonText?: string;
  source: 'GROUND_CONTROL';
  lastUpdatedUtc: string;
}

export interface GroundHoldingData {
  active: boolean;
  fix?: string;                   // e.g. "LAM"
  inboundTrackDeg?: number;
  turnDirection?: 'LEFT' | 'RIGHT';
  legDurationMin?: number;
  assignedAltitudeFt?: number;
  
  // ATC CLEARANCE (Operative Instruction)
  efcUtc?: string;                // Expect Further Clearance time
  
  // DECISION SUPPORT PREDICTION (Purely Advisory — NOT ATC CLEARANCE)
  predictedDelayMinutes?: number;
  predictedDelayDisclaimer: string; // "DECISION SUPPORT ONLY — NOT AN ATC CLEARANCE"
  predictionReason?: string;
  
  source: 'GROUND_CONTROL';
  lastUpdatedUtc: string;
}

export interface GroundProposedReroute {
  id: string;
  currentClearedRoute: string;    // Current operative route
  proposedRoute: string;          // Suggested routing from ATC
  reason: string;                 // e.g. "Traffic spacing for London TMA"
  routeDiff: string;              // e.g. "KENET -> BIG DCT EGLL"
  estimatedTimeImpactMin: number; // positive = longer, negative = shorter
  status: RerouteStatus;
  proposedAtUtc: string;
  pilotResponseAtUtc?: string;
  atcClearedAtUtc?: string;
  source: 'GROUND_CONTROL';
  lastUpdatedUtc: string;
}

export interface GroundOperationalNotice {
  id: string;
  urgency: NoticeUrgency;
  category: NoticeCategory;
  title: string;
  body: string;
  effectiveUtc?: string;
  expiresUtc?: string;
  source: string;                 // e.g. "LONDON CONTROL", "ATIS EGLL"
  issuedAtUtc: string;
  isStale?: boolean;
}

export interface GroundAirportConditions {
  airportIcao: string;            // e.g. "EGLL"
  activeRunway: string;           // e.g. "27R"
  previousRunway?: string;        // To flag recent runway changes
  runwayChangedAtUtc?: string;
  approachType: string;           // e.g. "ILS Z RWY 27R"
  surfaceConditionCode?: string;  // e.g. "WET - GOOD"
  windDirectionDeg?: number;
  windSpeedKts?: number;
  gustKts?: number;
  visibilityMeters?: number;
  cloudBase: string;              // e.g. "BKN 1800ft"
  temperatureC?: number;
  dewpointC?: number;
  qnhHpa: number;                 // e.g. 1013
  notams: string[];
  source: string;                 // e.g. "EGLL ATIS INFO D"
  observedAtUtc: string;
  lastUpdatedUtc: string;
}

export interface GroundMessage {
  id: string;
  flightId: string;
  source: 'ATC' | 'GROUND_CONTROL' | 'SYSTEM' | 'PILOT';
  timestampUtc: string;
  status: 'UNREAD' | 'READ' | 'ACKNOWLEDGED';
  subject: string;
  body: string;
  requiresAck: boolean;
  pilotResponse?: PilotResponseType;
  pilotResponseAtUtc?: string;
  pilotResponseNote?: string;
}

// ── 3. Consolidated Pilot State (Combined Dual Sources) ──────

export interface ConsolidatedDashboardState {
  contractVersion: typeof CONTRACT_VERSION;
  flightId: string;
  connectionStatus: ConnectionStatus;
  connectionLastSeenUtc: string;
  revision: number;
  generatedAtUtc: string;

  // AIRCRAFT DATA SOURCE
  aircraft: AircraftData;

  // GROUND CONTROL DATA SOURCE
  landingSequence: GroundLandingSequence;
  holding: GroundHoldingData;
  reroute?: GroundProposedReroute;
  conditions: GroundAirportConditions;
  notices: GroundOperationalNotice[];
  messages: GroundMessage[];
}

// ── 4. Outgoing Pilot Transmission Payload ───────────────────

export interface PilotResponsePayload {
  referencedMessageId: string;
  flightId: string;
  responseType: PilotResponseType;
  pilotNotes?: string;
  timestampUtc: string;
}

// ── 5. Demo Scenarios ────────────────────────────────────────

export type ScenarioName =
  | 'NORMAL_ARRIVAL'
  | 'EXTENDED_HOLD'
  | 'PROPOSED_REROUTE'
  | 'RUNWAY_WEATHER_CHANGE'
  | 'LOST_CONNECTION';

// ── Backward-Compatibility Type Aliases ───────────────────────
export type DashboardState = ConsolidatedDashboardState;
export type FlightData = AircraftData;
export type FuelData = AircraftFuelData;
export type HoldingData = GroundHoldingData;
export type LandingSequence = GroundLandingSequence;
export type RerouteData = GroundProposedReroute;
export type OperationalNotice = GroundOperationalNotice;
export type ArrivalConditions = GroundAirportConditions;
export type DashboardMessage = GroundMessage;

