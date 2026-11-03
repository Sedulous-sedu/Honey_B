export type DataMode = 'LIVE_OBSERVE' | 'REPLAY' | 'WHAT_IF' | 'FIXTURE_SIMULATION';

export interface ProviderHealth {
  provider: string;
  status: 'OK' | 'ONLINE' | 'DEGRADED' | 'DOWN' | 'DISCONNECTED' | 'NO_COVERAGE' | 'REPLAY';
  endpoint: string;
  lastSuccessUtc?: string | null;
  latencyMs?: number | null;
  recordsRetrieved?: number;
  failureCount?: number;
  message?: string | null;
}

export interface OperatingAirline {
  icao: string;
  iata: string | null;
  name: string;
  logoAssetPath?: string | null;
  matchMethod: 'PROVIDER_OPERATOR' | 'CALLSIGN_DIRECTORY';
  source: string;
  reviewedAtUtc: string | null;
}

export interface MarketingAirline {
  iata: string;
  flightNumber: string;
}

export interface FlightIdentity {
  trackId: string;
  icao24: string;
  callsignObserved: string | null;
  callsignRaw: string | null;
  flightNumberIata: string | null;
  flightNumberStatus: 'CONFIRMED_MATCH' | 'REFERENCE_ONLY' | 'UNAVAILABLE';
  operatingAirline: OperatingAirline | null;
  marketingAirlines?: MarketingAirline[];
  identitySource: string;
  identityFetchedAtUtc: string;
}

export interface Position {
  lat: number;
  lon: number;
  distanceToThresholdNm: number;
  distanceReference?: string;
}

export interface Speed {
  indicatedAirspeedKt: number | null;
  groundSpeedKt: number;
  airspeedType: string;
}

export interface Fuel {
  totalKg: number | null;
  enduranceMin: number | null;
  holdingFuelFlowKgH?: number | null;
  approachFuelFlowKgH?: number | null;
  descentFuelFlowKgH?: number | null;
  finalReserveKg?: number | null;
  missingDataReasons?: string[];
  provenance: string;
}

export interface Priority {
  level: 'NORMAL' | 'ELEVATED' | 'MINIMUM_FUEL' | 'MEDICAL' | 'EMERGENCY';
  reasonCodes: string[];
  provenance: string;
  declarationType?: 'NONE' | 'MAYDAY' | 'PAN_PAN';
  declarationStatus?: 'NONE' | 'UNCONFIRMED' | 'CONFIRMED';
  declaredAtUtc?: string | null;
  confirmedByControllerId?: string | null;
  emergencyNature?: string | null;
}

export interface Aircraft {
  callsign: string;
  trackId?: string | null;
  aircraftType: string;
  wakeCategory: string;
  origin: string;
  destination: string;
  flightPhase: 'UNKNOWN' | 'EN_ROUTE' | 'PARKED' | 'TAXI_OUT' | 'DEPARTURE' | 'CRUISE' | 'ARRIVAL' | 'HOLDING' | 'APPROACH' | 'FINAL' | 'LANDED' | 'TAXI_IN' | 'AT_STAND' | 'DIVERTING';
  inferredFlightClass?: string | null;
  status: 'NORMAL' | 'HOLDING' | 'DIVERTING' | 'PRIORITY' | 'UNABLE_TO_LAND';
  position: Position;
  altitudeFt: number;
  headingDeg: number;
  verticalRateFpm: number;
  speed: Speed;
  assignedRunway: string | null;
  approach: string | null;
  landingSequence: number | null;
  etaUtc: string | null;
  fuel: Fuel;
  capability: {
    lvpApproach: string;
    minApprovedRvrM?: number | null;
    operatorLvoApproved?: boolean;
    eligibleRunways?: string[];
    missingDataReasons?: string[];
  };
  assignedControllerId: string | null;
  priority: Priority;
  assignedStand: string | null;
  squawk?: string | null;
  icao24?: string | null;
  registration?: string | null;
  identity?: FlightIdentity | null;
  observedAtUtc?: string | null;
  receivedAtUtc?: string | null;
  dataFreshnessSec?: number | null;
  isStale?: boolean;
  onGround?: boolean;
  slotFrozen?: boolean;
  sourceProvider?: string | null;
  provenance?: string;
  missingDataReasons?: string[];
}

export interface RvrItem {
  runway: string;
  valueM: number;
  trend: string;
}

export interface Weather {
  airport: string;
  observedAt: string;
  rawMetar: string;
  visibilityM: number;
  rvr: RvrItem[];
  ceilingFt: number;
  wind: { directionDeg: number; speedKt: number };
  temperatureC: number;
  qnhHpa: number;
  flightCategory: string;
  lvp: { active: boolean; phase: string };
  alerts: string[];
  provenance: string;
}

export interface Suggestion {
  suggestionId: string;
  aircraftId: string;
  instructionType: string;
  displayText: string;
  params: Record<string, any>;
  reasonCodes: string[];
  reasonText: string;
  urgency: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  timeToDecisionPointSec: number;
  affectedAircraft: string[];
  status: 'ACTIVE' | 'OUTDATED' | 'EXECUTED';
  targetControllerId?: string;
}

export interface Command {
  commandId: string;
  aircraftId?: string;
  source: string;
  controllerId: string;
  controllerName: string;
  instructionType: string;
  targetAltitudeFt?: number;
  targetHeadingDeg?: number;
  targetSpeedKt?: number;
  newRunway?: string;
  displayText: string;
  status: 'SENT' | 'ACKNOWLEDGED' | 'STANDBY' | 'UNABLE' | 'EXECUTING' | 'DONE' | 'CANCELLED' | 'SUPERSEDED' | 'EXPIRED';
  response?: string;
  issuedAt: string;
  expiresAt: string;
  relatedSuggestionId?: string;
}

export interface Stand {
  id: string;
  terminal: string;
  size: 'SUPER' | 'WIDE' | 'NARROW';
  status: 'FREE' | 'OCCUPIED' | 'BLOCKED' | 'RESERVED';
  currentAircraft: string | null;
  notes?: string;
}

export interface Controller {
  id: string;
  name: string;
  role: string;
  sector: string;
  frequency: string;
  assignedAircraft: string[];
}

export interface EventLogEntry {
  timestamp: string;
  source: string;
  message: string;
  details?: Record<string, any>;
}

export interface Metrics {
  totalFlights: number;
  atRiskCount: number;
  delayedMinutes: number;
  fcfsBaselineDelayMin: number;
  conflictsAvoided: number;
}
