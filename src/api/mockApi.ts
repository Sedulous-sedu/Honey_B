import type {
  DashboardState,
  ScenarioName,
} from '../types';

// ============================================================
// MOCK API — Simulated ATC ↔ Pilot Data Exchange
// Integration note for control-centre team:
//   Replace getDashboardState() with a real WebSocket or
//   polling endpoint that returns a DashboardState JSON object.
//   POST pilot responses to /api/pilot-response (see bottom).
// ============================================================

const NOW_UTC = () => new Date().toISOString();
const UTC = (offsetMin: number) => {
  const d = new Date();
  d.setMinutes(d.getMinutes() + offsetMin);
  return d.toISOString();
};

// ── Scenario: Normal Arrival ─────────────────────────────────

const NORMAL_ARRIVAL: DashboardState = {
  connectionStatus: 'LIVE',
  connectionLastSeenUtc: NOW_UTC(),
  dataVersion: 42,
  generatedAtUtc: NOW_UTC(),
  flight: {
    flightId: 'EK201',
    callsign: 'EMIRATES 201',
    origin: 'OMDB',
    destination: 'EGLL',
    phase: 'DESCENT',
    altitudeFt: 18000,
    airspeedKts: 310,
    groundspeedKts: 425,
    remainingDistanceNm: 84,
    plannedRoute: 'OMDB RASVO UM728 BEVAV UL613 KENET EGLL',
    etaUtc: UTC(18),
    previousEtaUtc: UTC(20),
    etaUpdatedAtUtc: UTC(-5),
    etaChangeReasonCode: 'DIRECT_ROUTING',
    etaChangeReasonText: 'Direct routing via KENET approved by London Control',
    fuel: {
      fuelOnBoardKg: 14200,
      fuelFlowKgPerHr: 5800,
      alternatesFuelKg: 3100,
      finalReserveFuelKg: 2200,
      estimatedFuelAtArrivalKg: 12380,
      fuelTrendAssumptions: 'Based on current flow rate, no hold assumed. Assumes 18 min to landing.',
    },
  },
  landingSequence: {
    sequenceNumber: 4,
    totalInSequence: 11,
    assignedRunway: '27R',
    status: 'CONFIRMED',
    lastUpdatedUtc: UTC(-3),
  },
  holding: {
    active: false,
  },
  notices: [
    {
      id: 'N001',
      urgency: 'INFO',
      category: 'OTHER',
      title: 'Normal arrival — no irregularities',
      body: 'All systems nominal. Standard STAR active. Expect ILS Rwy 27R.',
      source: 'LONDON CONTROL',
      issuedAtUtc: UTC(-10),
      isStale: false,
    },
    {
      id: 'N002',
      urgency: 'LOW',
      category: 'WEATHER',
      title: 'Light rain reported at EGLL',
      body: 'Patchy light rain on approach. RVR adequate. No significant impact expected.',
      source: 'ATIS EGLL',
      issuedAtUtc: UTC(-8),
    },
  ],
  arrivalConditions: {
    activeRunway: '27R',
    ilsApproach: 'ILS Z RWY 27R',
    windDirectionDeg: 260,
    windSpeedKts: 12,
    gustKts: 18,
    visibilityMeters: 8000,
    cloudBase: 'BKN 1800ft',
    temperatureCelsius: 8,
    dewpointCelsius: 5,
    qnh: 1013,
    notams: ['PAPI Rwy 27R serviceble', 'Taxiway J partial closure — follow ground control instructions'],
    source: 'EGLL ATIS D',
    observedAtUtc: UTC(-6),
  },
  messages: [
    {
      id: 'MSG001',
      flightId: 'EK201',
      source: 'ATC',
      timestampUtc: UTC(-12),
      status: 'READ',
      subject: 'Descent clearance',
      body: 'EK201, descend FL180, expect ILS approach runway 27R, QNH 1013.',
      requiresAck: true,
      pilotResponse: 'ACKNOWLEDGE',
      pilotResponseAtUtc: UTC(-11),
    },
    {
      id: 'MSG002',
      flightId: 'EK201',
      source: 'ATC',
      timestampUtc: UTC(-4),
      status: 'UNREAD',
      subject: 'Sequence update',
      body: 'EK201, you are number 4 in sequence for runway 27R. Expect approach in approximately 18 minutes.',
      requiresAck: true,
    },
  ],
};

// ── Scenario: Extended Hold ───────────────────────────────────

const EXTENDED_HOLD: DashboardState = {
  connectionStatus: 'LIVE',
  connectionLastSeenUtc: NOW_UTC(),
  dataVersion: 71,
  generatedAtUtc: NOW_UTC(),
  flight: {
    flightId: 'EK201',
    callsign: 'EMIRATES 201',
    origin: 'OMDB',
    destination: 'EGLL',
    phase: 'HOLDING',
    altitudeFt: 15000,
    airspeedKts: 250,
    groundspeedKts: 290,
    remainingDistanceNm: 45,
    plannedRoute: 'OMDB RASVO UM728 BEVAV UL613 KENET EGLL',
    etaUtc: UTC(52),
    previousEtaUtc: UTC(22),
    etaUpdatedAtUtc: UTC(-2),
    etaChangeReasonCode: 'HOLDING_EXTENDED',
    etaChangeReasonText: 'Ground stop in effect at EGLL due to runway closure. Multiple aircraft holding.',
    fuel: {
      fuelOnBoardKg: 11400,
      fuelFlowKgPerHr: 5200,
      alternatesFuelKg: 3100,
      finalReserveFuelKg: 2200,
      estimatedFuelAtArrivalKg: 6890,
      fuelTrendAssumptions: 'Assumes 50 min remaining hold + 12 min approach. Current hold fuel burn ~5200 kg/hr.',
    },
  },
  landingSequence: {
    sequenceNumber: 9,
    totalInSequence: 17,
    assignedRunway: '27L',
    status: 'ESTIMATED',
    lastUpdatedUtc: UTC(-8),
  },
  holding: {
    active: true,
    fix: 'LAMBOURNE (LAM)',
    instructions: 'Hold NORTH of LAM, right-hand turns, 1 min legs, maintain FL150.',
    efcUtc: UTC(38),
    predictedRemainingDelayMin: 48,
    predictedDelayNote: 'Prediction based on current queue and ground stop advisory. This is a decision-support estimate only — not an ATC instruction to leave the hold.',
  },
  notices: [
    {
      id: 'N010',
      urgency: 'CRITICAL',
      category: 'DELAY',
      title: 'Ground stop — Rwy 27L/27R closed',
      body: 'Both 27L and 27R closed due to runway inspection following FOD report. Estimated reopening in 35–45 minutes. All arrivals holding.',
      source: 'LONDON TCA',
      issuedAtUtc: UTC(-15),
    },
    {
      id: 'N011',
      urgency: 'HIGH',
      category: 'DELAY',
      title: 'Extended delay — fuel review recommended',
      body: 'Total expected delay now 45–55 min. Pilots are advised to review fuel state and consider divert options if fuel does not support extended hold.',
      source: 'LONDON CONTROL',
      issuedAtUtc: UTC(-10),
    },
    {
      id: 'N012',
      urgency: 'MEDIUM',
      category: 'WEATHER',
      title: 'Scattered CB activity east of EGLL',
      body: 'Cumulonimbus cells at FL200 east of field. Holding stack unaffected. Monitor for developments.',
      source: 'SIGMET UK02',
      issuedAtUtc: UTC(-20),
    },
    {
      id: 'N013',
      urgency: 'LOW',
      category: 'OTHER',
      title: 'Expect runway 09R as alternate if 27s remain closed',
      body: 'If 27L/27R not reopened within 60 min, expect active runway change to 09R. Updated sequence will be issued.',
      source: 'LONDON TCA',
      issuedAtUtc: UTC(-5),
    },
  ],
  arrivalConditions: {
    activeRunway: '27L',
    ilsApproach: 'ILS Z RWY 27L',
    windDirectionDeg: 270,
    windSpeedKts: 16,
    gustKts: 24,
    visibilityMeters: 6000,
    cloudBase: 'SCT 1200ft CB',
    temperatureCelsius: 7,
    dewpointCelsius: 5,
    qnh: 1009,
    notams: ['RWY 27L/27R CLSD TIL FURTHER NOTICE', 'Expect delay — holding in effect at LAM, OCK, BIG'],
    source: 'EGLL ATIS F',
    observedAtUtc: UTC(-5),
  },
  messages: [
    {
      id: 'MSG010',
      flightId: 'EK201',
      source: 'ATC',
      timestampUtc: UTC(-18),
      status: 'ACKNOWLEDGED',
      acknowledgedAtUtc: UTC(-17),
      subject: 'Hold at LAM',
      body: 'EK201, hold at LAM, north, right turns, 1 min legs, FL150. Expect further clearance at ' + new Date(new Date().getTime() + 38 * 60000).toUTCString().slice(17, 22) + 'Z.',
      requiresAck: true,
      pilotResponse: 'ACKNOWLEDGE',
      pilotResponseAtUtc: UTC(-17),
    },
    {
      id: 'MSG011',
      flightId: 'EK201',
      source: 'ATC',
      timestampUtc: UTC(-8),
      status: 'UNREAD',
      subject: 'Delay update',
      body: 'EK201, updated expect further clearance time is now ' + new Date(new Date().getTime() + 38 * 60000).toISOString().slice(11, 16) + 'Z. Ground stop extends. Monitor fuel state.',
      requiresAck: true,
    },
    {
      id: 'MSG012',
      flightId: 'EK201',
      source: 'PILOT',
      timestampUtc: UTC(-6),
      status: 'READ',
      subject: 'Fuel concern reported',
      body: 'FUEL CONCERN: EK201 fuel state requires divert decision if hold extends beyond 50 min from now.',
      requiresAck: false,
      pilotResponse: 'FUEL_CONCERN',
      pilotResponseAtUtc: UTC(-6),
    },
  ],
};

// ── Scenario: Proposed Reroute ────────────────────────────────

const PROPOSED_REROUTE: DashboardState = {
  connectionStatus: 'LIVE',
  connectionLastSeenUtc: NOW_UTC(),
  dataVersion: 55,
  generatedAtUtc: NOW_UTC(),
  flight: {
    flightId: 'EK201',
    callsign: 'EMIRATES 201',
    origin: 'OMDB',
    destination: 'EGLL',
    phase: 'APPROACH',
    altitudeFt: 8000,
    airspeedKts: 240,
    groundspeedKts: 285,
    remainingDistanceNm: 38,
    plannedRoute: 'OMDB RASVO UM728 BEVAV UL613 KENET EGLL',
    etaUtc: UTC(14),
    previousEtaUtc: UTC(10),
    etaUpdatedAtUtc: UTC(-3),
    etaChangeReasonCode: 'REROUTE_PROPOSED',
    etaChangeReasonText: 'Reroute proposed via BIG adds approx +4 min but clears departure queue conflict.',
    fuel: {
      fuelOnBoardKg: 9800,
      fuelFlowKgPerHr: 6100,
      alternatesFuelKg: 3100,
      finalReserveFuelKg: 2200,
      estimatedFuelAtArrivalKg: 8373,
      fuelTrendAssumptions: 'Assumes current route, 14 min to landing. Proposed reroute would reduce by ~410 kg.',
    },
  },
  landingSequence: {
    sequenceNumber: 2,
    totalInSequence: 8,
    assignedRunway: '27R',
    status: 'CONFIRMED',
    lastUpdatedUtc: UTC(-2),
  },
  holding: { active: false },
  reroute: {
    id: 'RR-EK201-001',
    clearedRoute: 'KENET DCT EGLL',
    proposedRoute: 'BIG DCT EGLL',
    proposedRouteReason: 'Traffic sequencing conflict near KENET. Reroute via BIG resolves spacing with EZY345.',
    proposedRouteDiff: 'Remove KENET, insert BIG — adds approx 12 NM',
    estimatedTimeImpactMin: 4,
    status: 'AWAITING_RESPONSE',
    proposedAtUtc: UTC(-4),
  },
  notices: [
    {
      id: 'N020',
      urgency: 'HIGH',
      category: 'AIRSPACE',
      title: 'Reroute proposed — awaiting pilot response',
      body: 'London Control has proposed a reroute via BIG for traffic sequencing. See Reroute panel. Respond ACCEPT or UNABLE.',
      source: 'LONDON CONTROL',
      issuedAtUtc: UTC(-4),
    },
    {
      id: 'N021',
      urgency: 'MEDIUM',
      category: 'WEATHER',
      title: 'Light turbulence below FL100 near KENET',
      body: 'Moderate turbulence reports at FL080–100 in KENET sector. Reroute via BIG avoids affected area.',
      source: 'PIREP EK203',
      issuedAtUtc: UTC(-9),
    },
  ],
  arrivalConditions: {
    activeRunway: '27R',
    ilsApproach: 'ILS Z RWY 27R',
    windDirectionDeg: 265,
    windSpeedKts: 14,
    visibilityMeters: 9999,
    cloudBase: 'FEW 2500ft',
    temperatureCelsius: 9,
    dewpointCelsius: 4,
    qnh: 1015,
    source: 'EGLL ATIS G',
    observedAtUtc: UTC(-4),
  },
  messages: [
    {
      id: 'MSG020',
      flightId: 'EK201',
      source: 'ATC',
      timestampUtc: UTC(-4),
      status: 'UNREAD',
      subject: 'Reroute proposal — BIG DCT EGLL',
      body: 'EK201, London Control proposes reroute: BIG DCT EGLL instead of KENET. Traffic sequencing reason. Time impact +4 min. Please confirm able or unable.',
      requiresAck: true,
    },
  ],
};

// ── Scenario: Runway / Weather Change ────────────────────────

const RUNWAY_WEATHER_CHANGE: DashboardState = {
  connectionStatus: 'LIVE',
  connectionLastSeenUtc: NOW_UTC(),
  dataVersion: 88,
  generatedAtUtc: NOW_UTC(),
  flight: {
    flightId: 'EK201',
    callsign: 'EMIRATES 201',
    origin: 'OMDB',
    destination: 'EGLL',
    phase: 'APPROACH',
    altitudeFt: 5000,
    airspeedKts: 210,
    groundspeedKts: 255,
    remainingDistanceNm: 22,
    plannedRoute: 'OMDB RASVO UM728 BEVAV UL613 KENET EGLL',
    etaUtc: UTC(9),
    previousEtaUtc: UTC(7),
    etaUpdatedAtUtc: UTC(-1),
    etaChangeReasonCode: 'RWY_CHANGE',
    etaChangeReasonText: 'Runway change to 09L due to wind shift. Extended vectors required.',
    fuel: {
      fuelOnBoardKg: 8600,
      fuelFlowKgPerHr: 6300,
      alternatesFuelKg: 3100,
      finalReserveFuelKg: 2200,
      estimatedFuelAtArrivalKg: 7655,
      fuelTrendAssumptions: 'Assumes new runway 09L, 9 min to landing, no further hold.',
    },
  },
  landingSequence: {
    sequenceNumber: 5,
    totalInSequence: 9,
    assignedRunway: '09L',
    status: 'CONFIRMED',
    lastUpdatedUtc: UTC(-1),
  },
  holding: { active: false },
  notices: [
    {
      id: 'N030',
      urgency: 'CRITICAL',
      category: 'RUNWAY',
      title: 'Runway change — now 09L (was 27R)',
      body: 'Active runway changed to 09L due to rapid wind shift. New QFU 090°. Expect ILS Z RWY 09L. Brief crew immediately.',
      source: 'LONDON DIRECTOR',
      issuedAtUtc: UTC(-3),
    },
    {
      id: 'N031',
      urgency: 'HIGH',
      category: 'WEATHER',
      title: 'Wind shear alert — runway 09L threshold',
      body: 'Wind shear reported by B777 at 200ft on RWY 09L. 15kt gain followed by 20kt loss. Use caution, increase VREF.',
      source: 'EGLL ATIS H / PIREP',
      issuedAtUtc: UTC(-2),
    },
    {
      id: 'N032',
      urgency: 'HIGH',
      category: 'WEATHER',
      title: 'Visibility deteriorating — RVR 1200m',
      body: 'RVR on 09L now 1200m. CAT II/III procedures now in effect. Confirm aircraft and crew CAT II/III qualified.',
      source: 'EGLL MET',
      issuedAtUtc: UTC(-1),
    },
    {
      id: 'N033',
      urgency: 'MEDIUM',
      category: 'RUNWAY',
      title: 'Updated sequence — resequenced for 09L',
      body: 'New sequence issued following runway change. EK201 is #5 in sequence for 09L. Expect 9 min to approach.',
      source: 'LONDON DIRECTOR',
      issuedAtUtc: UTC(-1),
    },
    {
      id: 'N034',
      urgency: 'LOW',
      category: 'OTHER',
      title: 'ILS localiser 27R out of service',
      body: 'ILS LOC RWY 27R unserviceable. No impact on 09L operations. NOTAM UK A1234/26.',
      source: 'NATS NOTAM',
      issuedAtUtc: UTC(-45),
    },
  ],
  arrivalConditions: {
    activeRunway: '09L',
    ilsApproach: 'ILS Z RWY 09L CAT II',
    windDirectionDeg: 85,
    windSpeedKts: 18,
    gustKts: 28,
    visibilityMeters: 1200,
    cloudBase: 'OVC 200ft',
    temperatureCelsius: 6,
    dewpointCelsius: 5,
    qnh: 1006,
    notams: ['WIND SHEAR REPORTED RWY 09L THRESHOLD', 'CAT II/III OPS IN EFFECT RWY 09L', 'ILS LOC RWY 27R UNSERVICEABLE'],
    source: 'EGLL ATIS H',
    observedAtUtc: UTC(-2),
  },
  messages: [
    {
      id: 'MSG030',
      flightId: 'EK201',
      source: 'ATC',
      timestampUtc: UTC(-3),
      status: 'UNREAD',
      subject: 'URGENT — Runway change to 09L',
      body: 'EK201, runway change. Expect ILS RWY 09L. Wind shear reports on approach. Wind 090/18G28. QNH 1006. Acknowledge.',
      requiresAck: true,
    },
    {
      id: 'MSG031',
      flightId: 'EK201',
      source: 'ATC',
      timestampUtc: UTC(-1),
      status: 'UNREAD',
      subject: 'CAT II ops — confirm qualified',
      body: 'EK201, confirm aircraft and crew CAT II/III qualified. RVR 1200m. Advise ready for approach or request alternate.',
      requiresAck: true,
    },
  ],
};

// ── Scenario: Lost Connection ─────────────────────────────────

const LOST_CONNECTION: DashboardState = {
  connectionStatus: 'DISCONNECTED',
  connectionLastSeenUtc: UTC(-22),
  dataVersion: 33,
  generatedAtUtc: UTC(-22),
  flight: {
    flightId: 'EK201',
    callsign: 'EMIRATES 201',
    origin: 'OMDB',
    destination: 'EGLL',
    phase: 'DESCENT',
    altitudeFt: 24000,
    airspeedKts: 335,
    groundspeedKts: 480,
    remainingDistanceNm: 112,
    plannedRoute: 'OMDB RASVO UM728 BEVAV UL613 KENET EGLL',
    etaUtc: UTC(18),
    etaUpdatedAtUtc: UTC(-22),
    fuel: {
      fuelOnBoardKg: 15800,
      fuelFlowKgPerHr: 5600,
      alternatesFuelKg: 3100,
      finalReserveFuelKg: 2200,
      estimatedFuelAtArrivalKg: 13743,
      fuelTrendAssumptions: 'Last known data. Values may be stale — connection lost 22 min ago.',
    },
  },
  landingSequence: {
    sequenceNumber: 6,
    totalInSequence: 14,
    assignedRunway: '27R',
    status: 'ESTIMATED',
    lastUpdatedUtc: UTC(-22),
  },
  holding: { active: false },
  notices: [
    {
      id: 'N040',
      urgency: 'CRITICAL',
      category: 'STALE_DATA',
      title: 'Data link disconnected — all data is stale',
      body: 'Connection to control centre lost 22 minutes ago. Information displayed is the last known state. Do not rely on ATA/ETA, sequence, or conditions data until link restored.',
      source: 'SYSTEM',
      issuedAtUtc: UTC(-22),
      isStale: true,
    },
    {
      id: 'N041',
      urgency: 'HIGH',
      category: 'STALE_DATA',
      title: 'Sequence data stale — do not use for spacing',
      body: 'Landing sequence position was #6 of 14 as of last contact. Current sequence is unknown.',
      source: 'SYSTEM',
      issuedAtUtc: UTC(-22),
      isStale: true,
    },
  ],
  arrivalConditions: {
    activeRunway: '27R',
    ilsApproach: 'ILS Z RWY 27R',
    windDirectionDeg: 260,
    windSpeedKts: 12,
    visibilityMeters: 8000,
    cloudBase: 'FEW 1800ft',
    temperatureCelsius: 8,
    dewpointCelsius: 4,
    qnh: 1013,
    source: 'EGLL ATIS D (STALE — last contact 22 min ago)',
    observedAtUtc: UTC(-28),
  },
  messages: [
    {
      id: 'MSG040',
      flightId: 'EK201',
      source: 'SYSTEM',
      timestampUtc: UTC(-22),
      status: 'UNREAD',
      subject: 'Data link lost',
      body: 'VHF/ACARS data link to London Control is unavailable. Last successful contact at ' + UTC(-22) + '. Displayed information is preserved from last contact. Revert to voice communications.',
      requiresAck: true,
    },
  ],
};

// ── Scenario Registry ─────────────────────────────────────────

export const SCENARIOS: Record<string, DashboardState> = {
  NORMAL_ARRIVAL,
  EXTENDED_HOLD,
  PROPOSED_REROUTE,
  RUNWAY_WEATHER_CHANGE,
  LOST_CONNECTION,
};

// ── Mock API ──────────────────────────────────────────────────

/**
 * Simulates fetching current dashboard state from the ATC system.
 * Control centre team: replace this with a real fetch/WebSocket.
 *
 * GET /api/dashboard/{flightId}
 * Returns: DashboardState JSON
 */
export async function getDashboardState(scenarioName: string): Promise<DashboardState> {
  await new Promise((r) => setTimeout(r, 150)); // simulate network latency
  const scenario = SCENARIOS[scenarioName] ?? NORMAL_ARRIVAL;
  // Refresh timestamps so the data looks live
  return {
    ...scenario,
    generatedAtUtc: new Date().toISOString(),
    connectionLastSeenUtc:
      scenario.connectionStatus === 'DISCONNECTED'
        ? scenario.connectionLastSeenUtc
        : new Date().toISOString(),
  };
}

/**
 * Simulates sending a pilot response to the ATC system.
 * Control centre team: replace with POST to /api/pilot-response
 *
 * POST /api/pilot-response
 * Body: PilotResponsePayload JSON
 * Returns: { success: boolean; messageId: string }
 */
export interface PilotResponsePayload {
  messageId: string;
  flightId: string;
  responseType: string;
  note?: string;
  timestampUtc: string;
}

export async function sendPilotResponse(payload: PilotResponsePayload): Promise<{ success: boolean }> {
  await new Promise((r) => setTimeout(r, 200));
  console.log('[Mock API] Pilot response sent:', payload);
  return { success: true };
}
