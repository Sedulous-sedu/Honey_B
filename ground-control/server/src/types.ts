/**
 * ==============================================================================
 * GROUND CONTROL SERVER — CANONICAL TYPES
 * ==============================================================================
 * Matches plane/src/types/index.ts exactly.
 * The server produces ConsolidatedDashboardState; the plane consumes it.
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
  formattedCoordinates: string;
  remainingDistanceNm: number;
  headingDegTrue: number;
}

export interface AircraftFuelData {
  fuelOnBoardKg?: number;
  fuelFlowKgPerHr?: number;
  alternatesFuelKg?: number;
  finalReserveFuelKg?: number;
  estimatedFuelAtArrivalKg?: number;
  holdingEnduranceMinutes?: number;
  fuelTrendAssumptions?: string;
  unavailableReason?: string;
}

export interface AircraftData {
  flightId: string;
  callsign: string;
  aircraftType: string;
  originIcao: string;
  destinationIcao: string;
  flightPhase: FlightPhase;
  altitudeFt: number;
  verticalSpeedFpm: number;
  indicatedAirspeedKts: number;
  groundspeedKts: number;
  mach: number;
  position: AircraftPosition;
  currentClearedRoute: string;
  fmsEtaUtc: string;
  fmsEtaCalculatedAtUtc: string;
  fuel: AircraftFuelData;
  source: 'AIRCRAFT';
  lastUpdatedUtc: string;
}

// ── 2. Ground-Control-Originated Data (AMAN / ATC / ATIS) ────

export interface GroundLandingSequence {
  sequenceNumber: number;
  totalInSequence: number;
  assignedRunway?: string;
  status: SequenceStatus;
  targetLandingTimeUtc: string;
  delayMinutes: number;
  previousTargetLandingTimeUtc?: string;
  delayReasonText?: string;
  advisorySource?: 'AMAN_BASELINE' | 'CONTROLLER_APPROVED_ESTIMATE';
  approvedByControllerId?: string;
  approvedAtUtc?: string;
  isClearance?: boolean;
  disclaimerText?: string;
  source: 'GROUND_CONTROL';
  lastUpdatedUtc: string;
}

export interface GroundHoldingData {
  active: boolean;
  fix?: string;
  inboundTrackDeg?: number;
  turnDirection?: 'LEFT' | 'RIGHT';
  legDurationMin?: number;
  assignedAltitudeFt?: number;
  efcUtc?: string;
  predictedDelayMinutes?: number;
  predictedDelayDisclaimer: string;
  predictionReason?: string;
  source: 'GROUND_CONTROL';
  lastUpdatedUtc: string;
}

export interface GroundProposedReroute {
  id: string;
  currentClearedRoute: string;
  proposedRoute: string;
  reason: string;
  routeDiff: string;
  estimatedTimeImpactMin: number;
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
  source: string;
  issuedAtUtc: string;
  isStale?: boolean;
}

export interface GroundAirportConditions {
  airportIcao: string;
  activeRunway: string;
  previousRunway?: string;
  runwayChangedAtUtc?: string;
  approachType: string;
  surfaceConditionCode?: string;
  windDirectionDeg?: number;
  windSpeedKts?: number;
  gustKts?: number;
  visibilityMeters?: number;
  cloudBase: string;
  temperatureC?: number;
  dewpointC?: number;
  qnhHpa: number;
  notams: string[];
  source: string;
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

