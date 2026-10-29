import { useState, useEffect, useCallback } from 'react';
import type { DashboardState, ScenarioName, DashboardMessage } from './types';
import { getDashboardState } from './api/mockApi';
import { LiveClock } from './components/LiveClock';
import { ConnectionBadge } from './components/ConnectionBadge';
import { FlightContextCard } from './components/FlightContextCard';
import { LandingSequenceCard } from './components/LandingSequenceCard';
import { HoldingCard } from './components/HoldingCard';
import { RerouteCard } from './components/RerouteCard';
import { NoticesCard } from './components/NoticesCard';
import { FuelCard } from './components/FuelCard';
import { ArrivalConditionsCard } from './components/ArrivalConditionsCard';
import { MessagesPanel } from './components/MessagesPanel';

// ── Scenario metadata ─────────────────────────────────────────

const SCENARIOS: Array<{ id: ScenarioName; label: string; description: string }> = [
  { id: 'NORMAL_ARRIVAL', label: 'Normal Arrival', description: 'Standard descent, seq #4, minor weather' },
  { id: 'EXTENDED_HOLD', label: 'Extended Hold', description: 'Ground stop, 48 min delay, fuel concern' },
  { id: 'PROPOSED_REROUTE', label: 'Proposed Reroute', description: 'ATC proposes BIG DCT EGLL, +4 min' },
  { id: 'RUNWAY_WEATHER_CHANGE', label: 'Rwy / Weather Change', description: 'Runway changed to 09L, wind shear, CAT II' },
  { id: 'LOST_CONNECTION', label: 'Lost Connection', description: 'Data link lost 22 min ago, stale data' },
];

// ── App ────────────────────────────────────────────────────────

export default function App() {
  const [scenario, setScenario] = useState<ScenarioName>('NORMAL_ARRIVAL');
  const [state, setState] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(true);

  const loadScenario = useCallback(async (name: ScenarioName) => {
    setLoading(true);
    try {
      const data = await getDashboardState(name);
      setState(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadScenario(scenario);
  }, [scenario, loadScenario]);

  // Auto-refresh every 30 seconds (live scenarios)
  useEffect(() => {
    if (scenario === 'LOST_CONNECTION') return; // don't refresh stale scenario
    const t = setInterval(() => loadScenario(scenario), 30000);
    return () => clearInterval(t);
  }, [scenario, loadScenario]);

  const handleMessagesUpdate = (msgs: DashboardMessage[]) => {
    if (!state) return;
    setState({ ...state, messages: msgs });
  };

  const handleRerouteAccept = () => {
    if (!state?.reroute) return;
    setState({
      ...state,
      reroute: { ...state.reroute, status: 'ACCEPTED_BY_PILOT' },
    });
  };

  const handleRerouteUnable = () => {
    // No route change on pilot "unable"
  };

  const isStale = state?.connectionStatus !== 'LIVE';

  return (
    <div className="app">
      {/* ── Top Bar ── */}
      <header className="topbar" role="banner">
        <div className="topbar-brand">
          <span className="topbar-brand-icon">✈</span>
          <div>
            <div className="topbar-brand-text">FlightDeck AMS</div>
            <div className="topbar-brand-sub">Arrival Management — Pilot Interface</div>
          </div>
        </div>

        {state && (
          <>
            <div className="topbar-flight-id">{state.flight.flightId}</div>
            <div className="topbar-route">
              <span>{state.flight.origin}</span>
              <span className="topbar-route-arrow">→</span>
              <span>{state.flight.destination}</span>
              <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
                ({state.flight.callsign})
              </span>
            </div>
          </>
        )}

        <div className="topbar-spacer" />

        {state && (
          <ConnectionBadge
            status={state.connectionStatus}
            lastSeenUtc={state.connectionLastSeenUtc}
          />
        )}
        <LiveClock />
      </header>

      {/* ── Scenario Selector ── */}
      <nav className="scenario-bar" aria-label="Demo scenarios">
        <span className="scenario-bar-label">Demo Scenario:</span>
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            id={`scenario-btn-${s.id.toLowerCase().replace(/_/g, '-')}`}
            className={`scenario-btn ${scenario === s.id ? 'active' : ''}`}
            onClick={() => setScenario(s.id)}
            title={s.description}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {/* ── Loading ── */}
      {loading && (
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          fontSize: '0.9rem',
          gap: 'var(--space-md)',
        }}>
          <span style={{ animation: 'live-pulse 1s ease-in-out infinite', color: 'var(--color-primary)' }}>●</span>
          Loading scenario…
        </div>
      )}

      {/* ── Dashboard Grid ── */}
      {!loading && state && (
        <main className="dashboard" id="pilot-dashboard" role="main">

          {/* Disconnected full-width banner */}
          {state.connectionStatus === 'DISCONNECTED' && (
            <div className="disconnected-banner span-3" style={{ gridColumn: '1 / -1' }}>
              <span className="disconnected-banner-icon">📡</span>
              <div className="disconnected-banner-text">
                <div className="disconnected-banner-title">DATA LINK DISCONNECTED — All information below is from last known contact</div>
                <div className="disconnected-banner-sub">
                  Last contact: {state.connectionLastSeenUtc} · Revert to VHF voice communications
                </div>
              </div>
            </div>
          )}

          {/* Row 1 */}
          <FlightContextCard flight={state.flight} isStale={isStale} />
          <LandingSequenceCard sequence={state.landingSequence} isStale={isStale} />
          <HoldingCard holding={state.holding} />

          {/* Row 2 */}
          <NoticesCard notices={state.notices} isStale={isStale} />
          <RerouteCard
            reroute={state.reroute}
            onPilotAccept={handleRerouteAccept}
            onPilotUnable={handleRerouteUnable}
          />
          <FuelCard fuel={state.flight.fuel} isStale={isStale} />

          {/* Row 3 */}
          <ArrivalConditionsCard conditions={state.arrivalConditions} isStale={isStale} />
          <div style={{ gridColumn: 'span 2' }}>
            <MessagesPanel
              messages={state.messages}
              flightId={state.flight.flightId}
              onMessagesUpdate={handleMessagesUpdate}
            />
          </div>
        </main>
      )}

      {/* ── Footer disclaimer ── */}
      <footer className="sim-disclaimer">
        SIMULATION PROTOTYPE — NOT CERTIFIED AVIONICS — UAE HACKATHON 2026 — FOR DEMONSTRATION PURPOSES ONLY
        · Data version {state?.dataVersion ?? '—'} · Generated {state?.generatedAtUtc?.slice(11, 19)}Z
      </footer>
    </div>
  );
}
