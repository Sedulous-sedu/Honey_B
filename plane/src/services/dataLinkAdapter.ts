/**
 * ==============================================================================
 * DATALINK ADAPTER SERVICE
 * ==============================================================================
 * Provides a clean abstraction boundary between the pilot interface and
 * the data transport layer.
 *
 * For the hackathon demo, MockDataLinkAdapter runs independently with
 * realistic simulated scenarios. When the partner's ground-control system
 * is available, simply switch to HttpDataLinkAdapter or WebSocketDataLinkAdapter.
 * ==============================================================================
 */

import type {
  ConsolidatedDashboardState,
  PilotResponsePayload,
  ScenarioName,
  ConnectionStatus,
  GroundMessage,
} from '../types';

export interface DataLinkAdapter {
  /** Subscribe to real-time consolidated dashboard updates */
  subscribe(onStateUpdate: (state: ConsolidatedDashboardState) => void): () => void;
  
  /** Send an outgoing pilot response to ground control */
  sendPilotResponse(payload: PilotResponsePayload): Promise<{ success: boolean; transmissionId: string }>;
  
  /** Switch scenario in simulation mode */
  setScenario(name: ScenarioName): Promise<void>;
  
  /** Get current scenario name */
  getCurrentScenario(): ScenarioName;
  
  /** Get current connection status */
  getConnectionStatus(): ConnectionStatus;
  
  /** Pilot advisory acceptance of a proposed reroute */
  pilotAcceptReroute(rerouteId: string): void;
  
  /** Pilot unable to accept proposed reroute */
  pilotUnableReroute(rerouteId: string): void;
}

// ── Time Helpers for Real-time Simulation ──────────────────────

const nowIso = () => new Date().toISOString();
const offsetIso = (minutes: number) => {
  const d = new Date();
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
};

// ── Mock Scenarios Factory ─────────────────────────────────────

function createScenarios(): Record<ScenarioName, ConsolidatedDashboardState> {
  return {
    NORMAL_ARRIVAL: {
      contractVersion: '1.0.0',
      flightId: 'EK201',
      connectionStatus: 'LIVE',
      connectionLastSeenUtc: nowIso(),
      revision: 42,
      generatedAtUtc: nowIso(),
      aircraft: {
        flightId: 'EK201',
        callsign: 'EMIRATES 201',
        aircraftType: 'A388',
        originIcao: 'OMDB',
        destinationIcao: 'EGLL',
        flightPhase: 'DESCENT',
        altitudeFt: 18000,
        verticalSpeedFpm: -1400,
        indicatedAirspeedKts: 310,
        groundspeedKts: 425,
        mach: 0.78,
        position: {
          latitude: 51.4700,
          longitude: -0.4543,
          formattedCoordinates: '51°28\'12"N 000°27\'48"W',
          remainingDistanceNm: 84,
          headingDegTrue: 268,
        },
        currentClearedRoute: 'OMDB RASVO UM728 BEVAV UL613 KENET EGLL',
        fmsEtaUtc: offsetIso(18),
        fmsEtaCalculatedAtUtc: offsetIso(-2),
        fuel: {
          fuelOnBoardKg: 14200,
          fuelFlowKgPerHr: 5800,
          alternatesFuelKg: 3100,
          finalReserveFuelKg: 2200,
          estimatedFuelAtArrivalKg: 12460,
          holdingEnduranceMinutes: 52,
          fuelTrendAssumptions: 'Based on standard descent profile at 310 kts. Assumes 18 min to touchdown. No airborne hold factored.',
        },
        source: 'AIRCRAFT',
        lastUpdatedUtc: offsetIso(-1),
      },
      landingSequence: {
        sequenceNumber: 4,
        totalInSequence: 11,
        assignedRunway: '27R',
        status: 'CONFIRMED',
        targetLandingTimeUtc: offsetIso(19),
        delayMinutes: 1,
        previousTargetLandingTimeUtc: offsetIso(20),
        delayReasonText: 'Standard TMA arrival spacing via KENET.',
        source: 'GROUND_CONTROL',
        lastUpdatedUtc: offsetIso(-2),
      },
      holding: {
        active: false,
        predictedDelayDisclaimer: 'DECISION SUPPORT ONLY — NOT AN ATC CLEARANCE',
        source: 'GROUND_CONTROL',
        lastUpdatedUtc: offsetIso(-5),
      },
      conditions: {
        airportIcao: 'EGLL',
        activeRunway: '27R',
        approachType: 'ILS Z RWY 27R',
        windDirectionDeg: 260,
        windSpeedKts: 12,
        gustKts: 18,
        visibilityMeters: 8000,
        cloudBase: 'BKN 1800ft',
        temperatureC: 8,
        dewpointC: 5,
        qnhHpa: 1013,
        notams: [
          'PAPI Runway 27R operating nominally',
          'Taxiway J closed between J4 and J6 for maintenance',
        ],
        source: 'EGLL ATIS INFO D',
        observedAtUtc: offsetIso(-6),
        lastUpdatedUtc: offsetIso(-4),
      },
      notices: [
        {
          id: 'NOT-001',
          urgency: 'INFO',
          category: 'OTHER',
          title: 'Normal TMA Arrival Stream',
          body: 'All arrival gates nominal. Standard STAR KENET 1H active. Expect ILS Runway 27R.',
          source: 'LONDON CONTROL',
          issuedAtUtc: offsetIso(-15),
        },
        {
          id: 'NOT-002',
          urgency: 'LOW',
          category: 'WEATHER',
          title: 'Patchy Light Rain on Approach',
          body: 'Light rain reported west of London. Braking action reported GOOD. No operational constraints.',
          source: 'ATIS EGLL',
          issuedAtUtc: offsetIso(-10),
        },
      ],
      messages: [
        {
          id: 'MSG-001',
          flightId: 'EK201',
          source: 'ATC',
          timestampUtc: offsetIso(-12),
          status: 'ACKNOWLEDGED',
          subject: 'Descent clearance FL180',
          body: 'EK201, descend FL180, expect ILS approach runway 27R, QNH 1013.',
          requiresAck: true,
          pilotResponse: 'ACKNOWLEDGE',
          pilotResponseAtUtc: offsetIso(-11),
        },
        {
          id: 'MSG-002',
          flightId: 'EK201',
          source: 'ATC',
          timestampUtc: offsetIso(-4),
          status: 'UNREAD',
          subject: 'Arrival sequence update',
          body: 'EK201, sequence #4 confirmed for runway 27R. Maintain 250 kts on descent.',
          requiresAck: true,
        },
      ],
    },

    EXTENDED_HOLD: {
      contractVersion: '1.0.0',
      flightId: 'EK201',
      connectionStatus: 'LIVE',
      connectionLastSeenUtc: nowIso(),
      revision: 73,
      generatedAtUtc: nowIso(),
      aircraft: {
        flightId: 'EK201',
        callsign: 'EMIRATES 201',
        aircraftType: 'A388',
        originIcao: 'OMDB',
        destinationIcao: 'EGLL',
        flightPhase: 'HOLDING',
        altitudeFt: 15000,
        verticalSpeedFpm: 0,
        indicatedAirspeedKts: 240,
        groundspeedKts: 275,
        mach: 0.65,
        position: {
          latitude: 51.5200,
          longitude: 0.0500,
          formattedCoordinates: '51°31\'12"N 000°03\'00"E',
          remainingDistanceNm: 42,
          headingDegTrue: 90,
        },
        currentClearedRoute: 'OMDB RASVO UM728 BEVAV UL613 KENET EGLL',
        fmsEtaUtc: offsetIso(54),
        fmsEtaCalculatedAtUtc: offsetIso(-2),
        fuel: {
          fuelOnBoardKg: 10800,
          fuelFlowKgPerHr: 5100,
          alternatesFuelKg: 3100,
          finalReserveFuelKg: 2200,
          estimatedFuelAtArrivalKg: 5850,
          holdingEnduranceMinutes: 28,
          fuelTrendAssumptions: 'Calculated with active hold at FL150 at 5,100 kg/hr. 28 min hold margin remaining before committed to diversion alternate.',
        },
        source: 'AIRCRAFT',
        lastUpdatedUtc: offsetIso(-1),
      },
      landingSequence: {
        sequenceNumber: 9,
        totalInSequence: 18,
        assignedRunway: '27R',
        status: 'ESTIMATED',
        targetLandingTimeUtc: offsetIso(52),
        delayMinutes: 34,
        previousTargetLandingTimeUtc: offsetIso(20),
        delayReasonText: 'Ground stop at EGLL due to disabled aircraft on runway 27L. Single runway operations.',
        source: 'GROUND_CONTROL',
        lastUpdatedUtc: offsetIso(-2),
      },
      holding: {
        active: true,
        fix: 'LAM',
        inboundTrackDeg: 270,
        turnDirection: 'RIGHT',
        legDurationMin: 1,
        assignedAltitudeFt: 15000,
        efcUtc: offsetIso(45), // ATC Operative Instruction
        predictedDelayMinutes: 48, // Ground AMAN Prediction (Decision Support Only)
        predictedDelayDisclaimer: 'DECISION SUPPORT ONLY — NOT AN ATC CLEARANCE',
        predictionReason: 'Ground stop active. 14 aircraft in stack ahead. Average clearance rate 2 min per airframe.',
        source: 'GROUND_CONTROL',
        lastUpdatedUtc: offsetIso(-1),
      },
      conditions: {
        airportIcao: 'EGLL',
        activeRunway: '27R',
        approachType: 'ILS Z RWY 27R',
        windDirectionDeg: 250,
        windSpeedKts: 16,
        gustKts: 24,
        visibilityMeters: 6000,
        cloudBase: 'OVC 1400ft',
        temperatureC: 7,
        dewpointC: 5,
        qnhHpa: 1010,
        notams: [
          'Runway 27L temporarily closed due to disabled aircraft on exit taxiway N',
          'Single runway operations in effect for both arrivals and departures',
          'Flow control rate: 24 arrivals/hour',
        ],
        source: 'EGLL ATIS INFO F',
        observedAtUtc: offsetIso(-5),
        lastUpdatedUtc: offsetIso(-2),
      },
      notices: [
        {
          id: 'NOT-101',
          urgency: 'HIGH',
          category: 'DELAY',
          title: 'Ground Stop Active at EGLL — Runway 27L Blocked',
          body: 'Single runway operations in force. All arrivals entering standard holding patterns. EFC revisions being coordinated.',
          source: 'LONDON TMA SUPERVISOR',
          issuedAtUtc: offsetIso(-20),
        },
        {
          id: 'NOT-102',
          urgency: 'MEDIUM',
          category: 'AIRSPACE',
          title: 'Stack Congestion at LAM and OCK',
          body: 'LAM holding fix at capacity from FL120 to FL200. Speed control 240 kts mandatory.',
          source: 'LONDON CONTROL',
          issuedAtUtc: offsetIso(-14),
        },
        {
          id: 'NOT-103',
          urgency: 'LOW',
          category: 'WEATHER',
          title: 'Marginal VFR on Final Approach',
          body: 'Cloud ceiling lowering to 1400ft. Turbulence reported on intermediate descent.',
          source: 'ATIS EGLL',
          issuedAtUtc: offsetIso(-8),
        },
      ],
      messages: [
        {
          id: 'MSG-101',
          flightId: 'EK201',
          source: 'ATC',
          timestampUtc: offsetIso(-8),
          status: 'UNREAD',
          subject: 'Hold at LAM clearance — EFC issued',
          body: 'EK201, hold NORTH at LAM, inbound track 270, right turns, 1 min legs, FL150. Expect Further Clearance at ' + offsetIso(45).slice(11, 16) + 'Z. Report established.',
          requiresAck: true,
        },
      ],
    },

    PROPOSED_REROUTE: {
      contractVersion: '1.0.0',
      flightId: 'EK201',
      connectionStatus: 'LIVE',
      connectionLastSeenUtc: nowIso(),
      revision: 88,
      generatedAtUtc: nowIso(),
      aircraft: {
        flightId: 'EK201',
        callsign: 'EMIRATES 201',
        aircraftType: 'A388',
        originIcao: 'OMDB',
        destinationIcao: 'EGLL',
        flightPhase: 'DESCENT',
        altitudeFt: 19000,
        verticalSpeedFpm: -1200,
        indicatedAirspeedKts: 290,
        groundspeedKts: 395,
        mach: 0.76,
        position: {
          latitude: 51.3500,
          longitude: -0.1500,
          formattedCoordinates: '51°21\'00"N 000°09\'00"W',
          remainingDistanceNm: 72,
          headingDegTrue: 275,
        },
        currentClearedRoute: 'OMDB RASVO UM728 BEVAV UL613 KENET EGLL',
        fmsEtaUtc: offsetIso(22),
        fmsEtaCalculatedAtUtc: offsetIso(-3),
        fuel: {
          fuelOnBoardKg: 13600,
          fuelFlowKgPerHr: 5600,
          alternatesFuelKg: 3100,
          finalReserveFuelKg: 2200,
          estimatedFuelAtArrivalKg: 11480,
          holdingEnduranceMinutes: 44,
          fuelTrendAssumptions: 'Calculated with proposed tactical routing (+4 min burn estimated at +380 kg).',
        },
        source: 'AIRCRAFT',
        lastUpdatedUtc: offsetIso(-1),
      },
      landingSequence: {
        sequenceNumber: 3,
        totalInSequence: 14,
        assignedRunway: '27R',
        status: 'CONFIRMED',
        targetLandingTimeUtc: offsetIso(26),
        delayMinutes: 4,
        previousTargetLandingTimeUtc: offsetIso(22),
        delayReasonText: 'Tactical spacing for sequencing ahead of heavy arrival BAW12.',
        source: 'GROUND_CONTROL',
        lastUpdatedUtc: offsetIso(-2),
      },
      holding: {
        active: false,
        predictedDelayDisclaimer: 'DECISION SUPPORT ONLY — NOT AN ATC CLEARANCE',
        source: 'GROUND_CONTROL',
        lastUpdatedUtc: offsetIso(-6),
      },
      reroute: {
        id: 'REROUTE-2026-402',
        currentClearedRoute: 'OMDB RASVO UM728 BEVAV UL613 KENET EGLL',
        proposedRoute: 'OMDB RASVO UM728 BEVAV UL613 BIG DCT EGLL',
        reason: 'Traffic spacing & sequence optimization for London TMA. Avoids KENET conflict with departing stream.',
        routeDiff: 'KENET waypoint bypassed → routed via BIG DCT EGLL (+14 NM)',
        estimatedTimeImpactMin: 4,
        status: 'AWAITING_RESPONSE',
        proposedAtUtc: offsetIso(-3),
        source: 'GROUND_CONTROL',
        lastUpdatedUtc: offsetIso(-2),
      },
      conditions: {
        airportIcao: 'EGLL',
        activeRunway: '27R',
        approachType: 'ILS Z RWY 27R',
        windDirectionDeg: 270,
        windSpeedKts: 14,
        gustKts: 20,
        visibilityMeters: 9000,
        cloudBase: 'SCT 2500ft',
        temperatureC: 9,
        dewpointC: 4,
        qnhHpa: 1014,
        notams: ['Standard ILS CAT I operations'],
        source: 'EGLL ATIS INFO G',
        observedAtUtc: offsetIso(-8),
        lastUpdatedUtc: offsetIso(-3),
      },
      notices: [
        {
          id: 'NOT-201',
          urgency: 'MEDIUM',
          category: 'AIRSPACE',
          title: 'Proposed Tactical Reroute for Spacing',
          body: 'ATC proposes BIG DCT EGLL to resolve KENET crossing conflicts. Review route impact and advise capability.',
          source: 'LONDON CONTROL SECTOR 12',
          issuedAtUtc: offsetIso(-3),
        },
      ],
      messages: [
        {
          id: 'MSG-201',
          flightId: 'EK201',
          source: 'ATC',
          timestampUtc: offsetIso(-3),
          status: 'UNREAD',
          subject: 'Proposed tactical reroute via BIG',
          body: 'EK201, London Control proposes reroute via BIG DCT EGLL for spacing (+4 min impact). Confirm if able.',
          requiresAck: true,
        },
      ],
    },

    RUNWAY_WEATHER_CHANGE: {
      contractVersion: '1.0.0',
      flightId: 'EK201',
      connectionStatus: 'LIVE',
      connectionLastSeenUtc: nowIso(),
      revision: 95,
      generatedAtUtc: nowIso(),
      aircraft: {
        flightId: 'EK201',
        callsign: 'EMIRATES 201',
        aircraftType: 'A388',
        originIcao: 'OMDB',
        destinationIcao: 'EGLL',
        flightPhase: 'DESCENT',
        altitudeFt: 12000,
        verticalSpeedFpm: -1100,
        indicatedAirspeedKts: 260,
        groundspeedKts: 310,
        mach: 0.68,
        position: {
          latitude: 51.4800,
          longitude: -0.3200,
          formattedCoordinates: '51°28\'48"N 000°19\'12"W',
          remainingDistanceNm: 36,
          headingDegTrue: 85,
        },
        currentClearedRoute: 'OMDB RASVO UM728 BEVAV UL613 KENET EGLL',
        fmsEtaUtc: offsetIso(14),
        fmsEtaCalculatedAtUtc: offsetIso(-2),
        fuel: {
          fuelOnBoardKg: 12900,
          fuelFlowKgPerHr: 5400,
          alternatesFuelKg: 3100,
          finalReserveFuelKg: 2200,
          estimatedFuelAtArrivalKg: 11620,
          holdingEnduranceMinutes: 40,
          fuelTrendAssumptions: 'Runway change to 09L requires repositioning to east. Fuel reserves remain adequate.',
        },
        source: 'AIRCRAFT',
        lastUpdatedUtc: offsetIso(-1),
      },
      landingSequence: {
        sequenceNumber: 2,
        totalInSequence: 8,
        assignedRunway: '09L', // CHANGED FROM 27R
        status: 'CONFIRMED',
        targetLandingTimeUtc: offsetIso(16),
        delayMinutes: 2,
        previousTargetLandingTimeUtc: offsetIso(14),
        delayReasonText: 'Runway change in progress due to easterly wind shift and severe wind shear report on 27R.',
        source: 'GROUND_CONTROL',
        lastUpdatedUtc: offsetIso(-1),
      },
      holding: {
        active: false,
        predictedDelayDisclaimer: 'DECISION SUPPORT ONLY — NOT AN ATC CLEARANCE',
        source: 'GROUND_CONTROL',
        lastUpdatedUtc: offsetIso(-4),
      },
      conditions: {
        airportIcao: 'EGLL',
        activeRunway: '09L', // RUNWAY CHANGED
        previousRunway: '27R',
        runwayChangedAtUtc: offsetIso(-4),
        approachType: 'CAT II ILS RWY 09L',
        windDirectionDeg: 80, // WIND SHIFTED
        windSpeedKts: 22,
        gustKts: 34,
        visibilityMeters: 1200, // LOW VISIBILITY
        cloudBase: 'OVC 300ft',
        temperatureC: 4,
        dewpointC: 3,
        qnhHpa: 998,
        notams: [
          'RUNWAY CHANGE: 09L now active for arrivals, 09R for departures',
          'WIND SHEAR ALERT: 25 kt loss reported on 3 mile final runway 27R prior to change',
          'Low Visibility Procedures (LVP) Phase II in force. RVR 1200m.',
        ],
        source: 'EGLL ATIS INFO K',
        observedAtUtc: offsetIso(-3),
        lastUpdatedUtc: offsetIso(-1),
      },
      notices: [
        {
          id: 'NOT-301',
          urgency: 'CRITICAL',
          category: 'RUNWAY',
          title: 'RUNWAY CHANGE IN PROGRESS: Active Runway 09L',
          body: 'Airport configuration reversed due to easterly storm front and severe low-level windshear. Set nav frequencies for ILS 09L (110.3 MHz).',
          source: 'EGLL TOWER / ATIS K',
          issuedAtUtc: offsetIso(-4),
        },
        {
          id: 'NOT-302',
          urgency: 'HIGH',
          category: 'WEATHER',
          title: 'Low Visibility Procedures (LVP) Active',
          body: 'Ceiling 300ft overcast, RVR 1200m, gusts to 34 kts. Autoland capability or CAT II certification required.',
          source: 'MET OFFICE LONDON',
          issuedAtUtc: offsetIso(-5),
        },
      ],
      messages: [
        {
          id: 'MSG-301',
          flightId: 'EK201',
          source: 'ATC',
          timestampUtc: offsetIso(-2),
          status: 'UNREAD',
          subject: 'CRITICAL: Runway change to 09L & Windshear warning',
          body: 'EK201, runway is now 09L. Wind 080 at 22G34 kts. Expect radar vectors for CAT II ILS approach runway 09L. Acknowledge runway change.',
          requiresAck: true,
        },
      ],
    },

    LOST_CONNECTION: {
      contractVersion: '1.0.0',
      flightId: 'EK201',
      connectionStatus: 'DISCONNECTED',
      connectionLastSeenUtc: offsetIso(-22), // Lost 22 minutes ago
      revision: 60,
      generatedAtUtc: offsetIso(-22),
      aircraft: {
        flightId: 'EK201',
        callsign: 'EMIRATES 201',
        aircraftType: 'A388',
        originIcao: 'OMDB',
        destinationIcao: 'EGLL',
        flightPhase: 'DESCENT',
        altitudeFt: 16000,
        verticalSpeedFpm: -1000,
        indicatedAirspeedKts: 280,
        groundspeedKts: 360,
        mach: 0.72,
        position: {
          latitude: 51.4000,
          longitude: -0.2000,
          formattedCoordinates: '51°24\'00"N 000°12\'00"W',
          remainingDistanceNm: 58,
          headingDegTrue: 270,
        },
        currentClearedRoute: 'OMDB RASVO UM728 BEVAV UL613 KENET EGLL',
        fmsEtaUtc: offsetIso(14),
        fmsEtaCalculatedAtUtc: offsetIso(-22),
        fuel: {
          fuelOnBoardKg: 13100,
          fuelFlowKgPerHr: 5400,
          alternatesFuelKg: 3100,
          finalReserveFuelKg: 2200,
          estimatedFuelAtArrivalKg: 11840,
          holdingEnduranceMinutes: 42,
          fuelTrendAssumptions: 'Aircraft internal telemetry active; ground data connection is lost.',
        },
        source: 'AIRCRAFT',
        lastUpdatedUtc: offsetIso(-1),
      },
      landingSequence: {
        sequenceNumber: 5,
        totalInSequence: 12,
        assignedRunway: '27R',
        status: 'ESTIMATED',
        targetLandingTimeUtc: offsetIso(18),
        delayMinutes: 4,
        source: 'GROUND_CONTROL',
        lastUpdatedUtc: offsetIso(-22), // STALE
      },
      holding: {
        active: false,
        predictedDelayDisclaimer: 'DECISION SUPPORT ONLY — NOT AN ATC CLEARANCE',
        source: 'GROUND_CONTROL',
        lastUpdatedUtc: offsetIso(-22), // STALE
      },
      conditions: {
        airportIcao: 'EGLL',
        activeRunway: '27R',
        approachType: 'ILS Z RWY 27R',
        windDirectionDeg: 260,
        windSpeedKts: 12,
        visibilityMeters: 8000,
        cloudBase: 'BKN 1800ft',
        qnhHpa: 1013,
        notams: ['Last known ATIS D. Contact Tower on 118.5 for updated weather.'],
        source: 'EGLL ATIS (STALE)',
        observedAtUtc: offsetIso(-26),
        lastUpdatedUtc: offsetIso(-22), // STALE
      },
      notices: [
        {
          id: 'NOT-401',
          urgency: 'CRITICAL',
          category: 'SYSTEM',
          title: 'DATALINK DISCONNECTED — Revert to VHF Voice',
          body: 'Air-ground CPDLC / AMAN datalink dropped 22 minutes ago. All ground data is STALE. Do NOT use for active separation. Contact London Control 127.425.',
          source: 'ONBOARD AVIONICS WARNING',
          issuedAtUtc: offsetIso(-20),
          isStale: true,
        },
      ],
      messages: [
        {
          id: 'MSG-401',
          flightId: 'EK201',
          source: 'SYSTEM',
          timestampUtc: offsetIso(-22),
          status: 'UNREAD',
          subject: 'CPDLC link timed out',
          body: 'Ground datalink connection lost. Revert to primary VHF voice frequency 127.425 MHz.',
          requiresAck: true,
        },
      ],
    },
  };
}

// ── MockDataLinkAdapter Implementation ──────────────────────────

export class MockDataLinkAdapter implements DataLinkAdapter {
  private currentScenario: ScenarioName = 'NORMAL_ARRIVAL';
  private state: ConsolidatedDashboardState;
  private listeners: Set<(state: ConsolidatedDashboardState) => void> = new Set();
  private timer: number | null = null;

  constructor() {
    this.state = createScenarios().NORMAL_ARRIVAL;
    this.startHeartbeat();
  }

  private startHeartbeat() {
    if (this.timer) clearInterval(this.timer);
    // Periodically tick live timestamps if not in LOST_CONNECTION
    this.timer = window.setInterval(() => {
      if (this.state.connectionStatus === 'LIVE') {
        this.state = {
          ...this.state,
          connectionLastSeenUtc: nowIso(),
          generatedAtUtc: nowIso(),
          aircraft: {
            ...this.state.aircraft,
            lastUpdatedUtc: nowIso(),
          },
        };
        this.notify();
      }
    }, 10000);
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  subscribe(onStateUpdate: (state: ConsolidatedDashboardState) => void): () => void {
    this.listeners.add(onStateUpdate);
    onStateUpdate(this.state);
    return () => {
      this.listeners.delete(onStateUpdate);
    };
  }

  async setScenario(name: ScenarioName): Promise<void> {
    this.currentScenario = name;
    const scenarios = createScenarios();
    this.state = scenarios[name] ?? scenarios.NORMAL_ARRIVAL;
    this.notify();
  }

  getCurrentScenario(): ScenarioName {
    return this.currentScenario;
  }

  getConnectionStatus(): ConnectionStatus {
    return this.state.connectionStatus;
  }

  async sendPilotResponse(payload: PilotResponsePayload): Promise<{ success: boolean; transmissionId: string }> {
    const transmissionId = `TX-${Date.now()}`;
    
    // Simulate slight network latency
    await new Promise((r) => setTimeout(r, 120));

    // Update message state locally
    const updatedMessages: GroundMessage[] = this.state.messages.map((m) => {
      if (m.id === payload.referencedMessageId) {
        return {
          ...m,
          status: 'ACKNOWLEDGED' as const,
          pilotResponse: payload.responseType,
          pilotResponseAtUtc: payload.timestampUtc,
          pilotResponseNote: payload.pilotNotes,
        };
      }
      return m;
    });

    // Append outgoing pilot transmission to message stream
    const pilotOutbound: GroundMessage = {
      id: transmissionId,
      flightId: payload.flightId,
      source: 'PILOT',
      timestampUtc: payload.timestampUtc,
      status: 'ACKNOWLEDGED',
      subject: `Response: ${payload.responseType.replace(/_/g, ' ')}`,
      body: payload.pilotNotes
        ? `Ref #${payload.referencedMessageId}: ${payload.pilotNotes}`
        : `Acknowledged reference message #${payload.referencedMessageId} with status ${payload.responseType}`,
      requiresAck: false,
      pilotResponse: payload.responseType,
      pilotResponseAtUtc: payload.timestampUtc,
      pilotResponseNote: payload.pilotNotes,
    };

    this.state = {
      ...this.state,
      messages: [pilotOutbound, ...updatedMessages],
    };

    this.notify();
    return { success: true, transmissionId };
  }

  pilotAcceptReroute(rerouteId: string): void {
    if (!this.state.reroute || this.state.reroute.id !== rerouteId) return;
    
    // CRITICAL: Pilot acceptance sends intent, but DOES NOT change operative cleared route
    this.state = {
      ...this.state,
      reroute: {
        ...this.state.reroute,
        status: 'ACCEPTED_BY_PILOT',
        pilotResponseAtUtc: nowIso(),
      },
    };
    this.notify();
  }

  pilotUnableReroute(rerouteId: string): void {
    if (!this.state.reroute || this.state.reroute.id !== rerouteId) return;
    this.notify();
  }
}

// ── Production Adapter Templates for Future Ground-Control Link ──

/**
 * HttpDataLinkAdapter
 * Use when partner's Ground Control system exposes REST endpoints:
 *   - GET  /api/dashboard/{flightId}  -> ConsolidatedDashboardState
 *   - POST /api/pilot-response        -> PilotResponsePayload
 */
export class HttpDataLinkAdapter implements DataLinkAdapter {
  private baseUrl: string;
  private flightId: string;
  private pollIntervalMs: number;
  private timer: number | null = null;
  private listeners: Set<(state: ConsolidatedDashboardState) => void> = new Set();
  private latestState: ConsolidatedDashboardState | null = null;

  constructor(baseUrl: string, flightId: string = 'EK201', pollIntervalMs: number = 5000) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.flightId = flightId;
    this.pollIntervalMs = pollIntervalMs;
  }

  subscribe(onStateUpdate: (state: ConsolidatedDashboardState) => void): () => void {
    this.listeners.add(onStateUpdate);
    this.startPolling();
    return () => {
      this.listeners.delete(onStateUpdate);
      if (this.listeners.size === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  }

  private startPolling() {
    if (this.timer) return;
    const poll = async () => {
      try {
        const res = await fetch(`${this.baseUrl}/api/dashboard/${this.flightId}`);
        if (res.ok) {
          const data: ConsolidatedDashboardState = await res.json();
          this.latestState = data;
          for (const l of this.listeners) l(data);
        }
      } catch (err) {
        console.warn('Ground Control HTTP polling error:', err);
      }
    };
    poll();
    this.timer = window.setInterval(poll, this.pollIntervalMs);
  }

  async sendPilotResponse(payload: PilotResponsePayload): Promise<{ success: boolean; transmissionId: string }> {
    const res = await fetch(`${this.baseUrl}/api/pilot-response`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.json();
  }

  async setScenario(_name: ScenarioName): Promise<void> {
    // In live mode, scenario is dictated by ground control server
  }

  getCurrentScenario(): ScenarioName {
    return 'NORMAL_ARRIVAL';
  }

  getConnectionStatus(): ConnectionStatus {
    return this.latestState?.connectionStatus ?? 'DISCONNECTED';
  }

  pilotAcceptReroute(rerouteId: string): void {
    this.sendPilotResponse({
      referencedMessageId: rerouteId,
      flightId: this.flightId,
      responseType: 'ACKNOWLEDGE',
      pilotNotes: 'Pilot accepts proposed reroute. Awaiting formal clearance.',
      timestampUtc: new Date().toISOString(),
    });
  }

  pilotUnableReroute(rerouteId: string): void {
    this.sendPilotResponse({
      referencedMessageId: rerouteId,
      flightId: this.flightId,
      responseType: 'UNABLE',
      pilotNotes: 'Pilot unable proposed reroute. Maintain current cleared route.',
      timestampUtc: new Date().toISOString(),
    });
  }
}

// ── Active Adapter Configuration ────────────────────────────────────────────
// Switch between mock and live ground-control server here.
//
// FOR DEMO (connected to Ground Control server):
//   Change to: new HttpDataLinkAdapter('http://<GROUND_CONTROL_IP>:8000', 'UAE231')
//   Replace <GROUND_CONTROL_IP> with the IP of the machine running the server.
//   Aircraft IDs available: UAE231, FDB512, SIA317, BAW107, THY762, IGO1433
//
// FOR STANDALONE (no server needed):
//   Keep as: new MockDataLinkAdapter()

const GROUND_CONTROL_URL = import.meta.env.VITE_GROUND_URL ?? '';
const DEMO_FLIGHT_ID = import.meta.env.VITE_FLIGHT_ID ?? 'UAE231';

export const activeDataLinkAdapter: DataLinkAdapter =
  GROUND_CONTROL_URL
    ? new HttpDataLinkAdapter(GROUND_CONTROL_URL, DEMO_FLIGHT_ID)
    : new MockDataLinkAdapter();
