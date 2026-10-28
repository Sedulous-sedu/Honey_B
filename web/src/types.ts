export interface Position {
  lat: number;
  lon: number;
  distanceToThresholdNm: number;
}

export interface Speed {
  indicatedAirspeedKt: number;
  groundSpeedKt: number;
  airspeedType: string;
}

export interface Fuel {
  totalKg: number;
  enduranceMin: number;
  holdingFuelFlowKgH: number;
  finalReserveKg: number;
  provenance: string;
}

export interface Priority {
  level: 'NORMAL' | 'ELEVATED' | 'MINIMUM_FUEL' | 'MEDICAL' | 'EMERGENCY';
  reasonCodes: string[];
  provenance: string;
}

export interface Aircraft {
  callsign: string;
  aircraftType: string;
  wakeCategory: string;
  origin: string;
  destination: string;
  flightPhase: 'PARKED' | 'TAXI_OUT' | 'DEPARTURE' | 'CRUISE' | 'ARRIVAL' | 'HOLDING' | 'APPROACH' | 'FINAL' | 'LANDED' | 'TAXI_IN' | 'AT_STAND' | 'DIVERTING';
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
  capability: { lvpApproach: string };
  assignedControllerId: string | null;
  priority: Priority;
  assignedStand: string | null;
  squawk?: string;
  icao24?: string;
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
