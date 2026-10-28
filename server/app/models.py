from enum import Enum
from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel, Field

class Provenance(str, Enum):
    SIMULATED = "SIMULATED"
    PILOT_REPORTED = "PILOT_REPORTED"
    RULE_BASED = "RULE_BASED"
    AI_DERIVED = "AI_DERIVED"

class FlightPhase(str, Enum):
    PARKED = "PARKED"
    TAXI_OUT = "TAXI_OUT"
    DEPARTURE = "DEPARTURE"
    CRUISE = "CRUISE"
    ARRIVAL = "ARRIVAL"
    HOLDING = "HOLDING"
    APPROACH = "APPROACH"
    FINAL = "FINAL"
    LANDED = "LANDED"
    TAXI_IN = "TAXI_IN"
    AT_STAND = "AT_STAND"
    DIVERTING = "DIVERTING"

class FlightStatus(str, Enum):
    NORMAL = "NORMAL"
    HOLDING = "HOLDING"
    DIVERTING = "DIVERTING"
    PRIORITY = "PRIORITY"
    UNABLE_TO_LAND = "UNABLE_TO_LAND"

class PriorityLevel(str, Enum):
    NORMAL = "NORMAL"
    ELEVATED = "ELEVATED"
    MINIMUM_FUEL = "MINIMUM_FUEL"
    MEDICAL = "MEDICAL"
    EMERGENCY = "EMERGENCY"

class LvpApproach(str, Enum):
    CAT_I = "CAT_I"
    CAT_II = "CAT_II"
    CAT_IIIA = "CAT_IIIA"
    CAT_IIIB = "CAT_IIIB"

class LvpPhase(str, Enum):
    NONE = "NONE"
    LVP_PREPARATION = "LVP_PREPARATION"
    LVP_ACTIVE = "LVP_ACTIVE"
    LVP_CANCELLED = "LVP_CANCELLED"

class FlightCategory(str, Enum):
    VFR = "VFR"
    MVFR = "MVFR"
    IFR = "IFR"
    LIFR = "LIFR"

class InstructionType(str, Enum):
    ALTITUDE = "ALTITUDE"
    HEADING = "HEADING"
    SPEED = "SPEED"
    HOLD = "HOLD"
    RUNWAY_CHANGE = "RUNWAY_CHANGE"
    APPROACH_CLEARANCE = "APPROACH_CLEARANCE"
    LANDING_CLEARANCE = "LANDING_CLEARANCE"
    DIVERT = "DIVERT"
    INFORMATION = "INFORMATION"

class CommandStatus(str, Enum):
    SENT = "SENT"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    STANDBY = "STANDBY"
    UNABLE = "UNABLE"
    EXECUTING = "EXECUTING"
    DONE = "DONE"
    CANCELLED = "CANCELLED"
    SUPERSEDED = "SUPERSEDED"
    EXPIRED = "EXPIRED"

class PilotResponse(str, Enum):
    WILCO = "WILCO"
    UNABLE = "UNABLE"
    STANDBY = "STANDBY"

class Position(BaseModel):
    lat: float
    lon: float
    distanceToThresholdNm: float

class Speed(BaseModel):
    indicatedAirspeedKt: float
    groundSpeedKt: float
    airspeedType: str = "IAS_APPROX"

class Fuel(BaseModel):
    totalKg: float
    enduranceMin: float
    holdingFuelFlowKgH: float
    finalReserveKg: float
    provenance: Provenance = Provenance.SIMULATED

class Capability(BaseModel):
    lvpApproach: LvpApproach = LvpApproach.CAT_IIIB

class Priority(BaseModel):
    level: PriorityLevel = PriorityLevel.NORMAL
    reasonCodes: List[str] = Field(default_factory=list)
    provenance: Provenance = Provenance.RULE_BASED

class AircraftStatePayload(BaseModel):
    callsign: str
    aircraftType: str
    wakeCategory: str
    origin: str
    destination: str
    flightPhase: FlightPhase
    status: FlightStatus
    position: Position
    altitudeFt: float
    targetAltitudeFt: Optional[float] = None
    headingDeg: float
    targetHeadingDeg: Optional[float] = None
    verticalRateFpm: float
    speed: Speed
    targetSpeedKt: Optional[float] = None
    assignedRunway: Optional[str] = None
    approach: Optional[str] = None
    landingSequence: Optional[int] = None
    etaUtc: Optional[str] = None
    fuel: Fuel
    capability: Capability
    assignedControllerId: Optional[str] = None
    priority: Priority
    assignedStand: Optional[str] = None
    squawk: Optional[str] = None
    icao24: Optional[str] = None
    provenance: Provenance = Provenance.SIMULATED

class RvrItem(BaseModel):
    runway: str
    valueM: float
    trend: str = "NO_CHANGE"

class Wind(BaseModel):
    directionDeg: float
    speedKt: float

class LvpInfo(BaseModel):
    active: bool
    phase: LvpPhase

class WeatherPayload(BaseModel):
    airport: str = "OMDB"
    observedAt: str
    rawMetar: str
    visibilityM: float
    rvr: List[RvrItem]
    ceilingFt: float
    wind: Wind
    temperatureC: float
    qnhHpa: float
    flightCategory: FlightCategory
    lvp: LvpInfo
    alerts: List[str] = Field(default_factory=list)
    provenance: Provenance = Provenance.SIMULATED

class CommandIssuedPayload(BaseModel):
    commandId: str
    aircraftId: Optional[str] = None
    source: str = "ATC"
    controllerId: str
    controllerName: str
    instructionType: InstructionType
    targetAltitudeFt: Optional[float] = None
    targetHeadingDeg: Optional[float] = None
    turnDirection: Optional[str] = None
    targetSpeedKt: Optional[float] = None
    fix: Optional[str] = None
    holdAltitudeFt: Optional[float] = None
    expectFurtherClearanceUtc: Optional[str] = None
    legTimeMin: Optional[float] = None
    newRunway: Optional[str] = None
    newApproach: Optional[str] = None
    approach: Optional[str] = None
    runway: Optional[str] = None
    windText: Optional[str] = None
    alternateIcao: Optional[str] = None
    routeText: Optional[str] = None
    text: Optional[str] = None
    displayText: str
    allowedResponses: List[str] = Field(default_factory=lambda: ["WILCO", "UNABLE", "STANDBY"])
    status: CommandStatus = CommandStatus.SENT
    issuedAt: str
    expiresAt: str
    supersedes: Optional[str] = None
    relatedSuggestionId: Optional[str] = None

class CommandStatusPayload(BaseModel):
    commandId: str
    status: CommandStatus
    previousStatus: Optional[CommandStatus] = None
    response: Optional[PilotResponse] = None
    reason: Optional[str] = None
    supersededBy: Optional[str] = None
    changedAt: str

class StandUpdatedPayload(BaseModel):
    standId: str
    terminal: str
    previousStandId: Optional[str] = None
    reason: Optional[str] = None
    effectiveFrom: str
    isClearance: bool = False
    provenance: Provenance = Provenance.SIMULATED

class AdvisoryPayload(BaseModel):
    advisoryId: str
    source: str = "HONEY_B_ADVISORY"
    isInstruction: bool = False
    severity: str = "INFO" # INFO, CAUTION, WARNING
    category: str = "WEATHER" # WEATHER, FUEL, SEQUENCE, RUNWAY, CONFLICT, STAND
    title: str
    summary: str
    reasoning: List[str] = Field(default_factory=list)
    expiresAt: Optional[str] = None
    provenance: Provenance = Provenance.AI_DERIVED

class SuggestionItem(BaseModel):
    suggestionId: str
    aircraftId: str
    instructionType: InstructionType
    displayText: str
    params: Dict[str, Any] = Field(default_factory=dict)
    reasonCodes: List[str] = Field(default_factory=list)
    reasonText: str
    urgency: str = "MEDIUM" # CRITICAL, HIGH, MEDIUM, LOW
    timeToDecisionPointSec: int = 120
    affectedAircraft: List[str] = Field(default_factory=list)
    status: str = "ACTIVE" # ACTIVE, OUTDATED, EXECUTED
    targetControllerId: Optional[str] = None

class EventEnvelope(BaseModel):
    type: str
    version: str = "v1"
    eventId: str
    revision: int
    timestamp: str
    aircraftId: Optional[str] = None
    payload: Any

class ReportAckPayload(BaseModel):
    reportId: str
    accepted: bool
    note: Optional[str] = None

class ErrorPayload(BaseModel):
    code: str
    message: str
    relatedEventId: Optional[str] = None
    commandId: Optional[str] = None
