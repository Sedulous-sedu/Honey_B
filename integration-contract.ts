/**
 * ==============================================================================
 * AIR-GROUND INTEGRATION CONTRACT (VERSION 1.0.0)
 * ==============================================================================
 * Shared type definitions for communication between:
 *   - plane/           (Pilot In-Plane Application)
 *   - ground-control/  (Airport Control Centre Application)
 *
 * UAE Hackathon 2026 Prototype
 * ==============================================================================
 */

export const CONTRACT_VERSION = '1.0.0' as const;

export type MessageSource = 'AIRCRAFT' | 'GROUND_CONTROL';

export type AcknowledgmentState =
  | 'NONE'
  | 'REQUIRED'
  | 'ACKNOWLEDGED'
  | 'UNABLE'
  | 'CLARIFICATION_REQUESTED'
  | 'FUEL_CONCERN';

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

export type EmergencyDeclarationType = 'NONE' | 'MAYDAY' | 'PAN_PAN';

export type DeclarationStatus = 'NONE' | 'UNCONFIRMED' | 'CONFIRMED';

export type EpistemicStatus = 'AUTHORITATIVE' | 'PILOT_REPORTED' | 'SIMULATED' | 'DEMO_ASSUMPTION';

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

/** Universal Message Envelope for discrete messages */
export interface MessageEnvelope<T = unknown> {
  contractVersion: typeof CONTRACT_VERSION;
  messageId: string;
  flightId: string;
  source: MessageSource;
  revision: number;
  timestampUtc: string; // ISO 8601 UTC string
  acknowledgmentState: AcknowledgmentState;
  payloadType: string;
  payload: T;
}

// ── Aircraft-to-Ground (A2G) Models ──────────────────────────

export interface AircraftPosition {
  latitude: number;
  longitude: number;
  remainingDistanceNm: number;
  headingDegTrue: number;
}

export interface AircraftFuelData {
  fuelOnBoardKg?: number;
  fuelFlowKgPerHr?: number;
  alternatesFuelKg?: number;
  finalReserveFuelKg?: number;
  estimatedFuelAtArrivalKg?: number;
  fuelTrendAssumptions?: string;
  unavailableReason?: string;
}

export interface AircraftTelemetryPayload {
  flightId: string;
  callsign: string;
  aircraftType: string;
  originIcao: string;
  destinationIcao: string;
  flightPhase: FlightPhase;
  position: AircraftPosition;
  altitudeFt: number;
  indicatedAirspeedKts: number;
  groundspeedKts: number;
  mach?: number;
  currentClearedRoute: string;
  fmsEtaUtc: string;
  fmsEtaCalculatedAtUtc: string;
  fuel?: AircraftFuelData;
  source: 'AIRCRAFT';
  lastUpdatedUtc: string;
}

export interface PilotResponsePayload {
  referencedMessageId: string;
  flightId: string;
  responseType: PilotResponseType;
  pilotNotes?: string;
  timestampUtc: string;
}

// ── Ground-to-Aircraft (G2A) Models ──────────────────────────

export interface ArrivalSequencePayload {
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

export interface HoldingInstructionPayload {
  active: boolean;
  fix?: string;
  inboundTrackDeg?: number;
  turnDirection?: 'LEFT' | 'RIGHT';
  legDurationMin?: number;
  assignedAltitudeFt?: number;
  efcUtc?: string; // ATC clearance
  predictedDelayMinutes?: number; // Decision-support estimate
  predictedDelayDisclaimer: string;
  predictionReason?: string;
  source: 'GROUND_CONTROL';
  lastUpdatedUtc: string;
}

export interface ProposedReroutePayload {
  rerouteId: string;
  currentClearedRoute: string;
  proposedRoute: string;
  reason: string;
  routeDiff: string;
  estimatedTimeImpactMinutes: number;
  status: RerouteStatus;
  proposedAtUtc: string;
  pilotResponseAtUtc?: string;
  atcClearedAtUtc?: string;
  source: 'GROUND_CONTROL';
  lastUpdatedUtc: string;
}

export interface AirportConditionsPayload {
  airportIcao: string;
  activeRunway: string;
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

export interface OperationalNoticePayload {
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

export interface GroundMessagePayload {
  id: string;
  flightId: string;
  source: 'ATC' | 'GROUND_CONTROL' | 'SYSTEM';
  timestampUtc: string;
  status: 'UNREAD' | 'READ' | 'ACKNOWLEDGED';
  subject: string;
  body: string;
  requiresAck: boolean;
  pilotResponse?: PilotResponseType;
  pilotResponseAtUtc?: string;
  pilotResponseNote?: string;
}

// ── Complete Consolidated Dashboard State ─────────────────────

export interface ConsolidatedDashboardState {
  contractVersion: typeof CONTRACT_VERSION;
  flightId: string;
  connectionStatus: ConnectionStatus;
  connectionLastSeenUtc: string;
  revision: number;
  generatedAtUtc: string;
  
  // From Aircraft
  aircraft: AircraftTelemetryPayload;
  
  // From Ground Control
  landingSequence: ArrivalSequencePayload;
  holding: HoldingInstructionPayload;
  reroute?: ProposedReroutePayload;
  conditions: AirportConditionsPayload;
  notices: OperationalNoticePayload[];
  messages: GroundMessagePayload[];
}
