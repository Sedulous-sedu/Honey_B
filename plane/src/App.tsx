import { useState, useEffect } from 'react';
import type { ConsolidatedDashboardState, ScenarioName, PilotResponseType } from './types';
import { activeDataLinkAdapter } from './services/dataLinkAdapter';
import { TopBar } from './components/TopBar';
import { ScenarioSelector } from './components/ScenarioSelector';
import { DisconnectedBanner } from './components/DisconnectedBanner';
import { TabletPilotOverview } from './components/TabletPilotOverview';
import { ArrivalOverviewCard } from './components/ArrivalOverviewCard';
import { AircraftTelemetryCard } from './components/AircraftTelemetryCard';
import { FuelCard } from './components/FuelCard';
import { RerouteCard } from './components/RerouteCard';
import { ArrivalConditionsCard } from './components/ArrivalConditionsCard';
import { OperationalNoticesCard } from './components/OperationalNoticesCard';
import { MessagesPanel } from './components/MessagesPanel';

export default function App() {
  const [scenario, setScenario] = useState<ScenarioName>('NORMAL_ARRIVAL');
  const [state, setState] = useState<ConsolidatedDashboardState | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'detailed'>('overview');
  const [highlightedCardId, setHighlightedCardId] = useState<string | null>(null);

  useEffect(() => {
    // Subscribe to datalink adapter updates
    const unsubscribe = activeDataLinkAdapter.subscribe((updatedState) => {
      setState(updatedState);
    });
    return () => unsubscribe();
  }, []);

  const handleScenarioChange = async (newScenario: ScenarioName) => {
    setScenario(newScenario);
    await activeDataLinkAdapter.setScenario(newScenario);
  };

  const handlePilotAcceptReroute = (rerouteId: string) => {
    activeDataLinkAdapter.pilotAcceptReroute(rerouteId);
  };

  const handlePilotUnableReroute = (rerouteId: string) => {
    activeDataLinkAdapter.pilotUnableReroute(rerouteId);
  };

  const handleSendPilotResponse = async (responseType: PilotResponseType, text: string) => {
    if (!state) return;
    await activeDataLinkAdapter.sendPilotResponse({
      referencedMessageId: `OVR-${Date.now()}`,
      flightId: state.flightId,
      responseType,
      pilotNotes: text,
      timestampUtc: new Date().toISOString(),
    });
  };

  const handleNavigateToSection = (sectionId: string) => {
    // If on overview mode, open detailed view
    setActiveTab('detailed');
    setHighlightedCardId(sectionId);

    // Smoothly scroll to the target card
    setTimeout(() => {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 50);

    // Remove highlight pulse after 3 seconds
    setTimeout(() => {
      setHighlightedCardId(null);
    }, 3000);
  };

  const isDatalinkStale = state?.connectionStatus !== 'LIVE';

  return (
    <div className="app-container">
      {/* ── Cockpit Top Bar ── */}
      <TopBar
        aircraft={state?.aircraft}
        connectionStatus={state?.connectionStatus ?? 'DISCONNECTED'}
        lastSeenUtc={state?.connectionLastSeenUtc ?? ''}
      />

      {/* ── Demo Scenario Switcher Bar ── */}
      <ScenarioSelector
        currentScenario={scenario}
        onSelectScenario={handleScenarioChange}
      />

      {/* ── Disclaimer Banner ── */}
      <div className="prototype-safety-strip" role="alert">
        <span className="strip-badge">SIMULATION PROTOTYPE</span>
        <span>
          NOT CERTIFIED AVIONICS · FOR DEMONSTRATION PURPOSES ONLY · NOT A SOURCE OF AIR TRAFFIC CLEARANCE
        </span>
        <span className="strip-version">CONTRACT V{state?.contractVersion ?? '1.0.0'} · REV #{state?.revision ?? 0}</span>
      </div>

      {/* ── Disconnected / Delayed Alert Banner ── */}
      {state && (
        <DisconnectedBanner
          status={state.connectionStatus}
          lastSeenUtc={state.connectionLastSeenUtc}
        />
      )}

      {/* ── FIRST SECTION & DEFAULT VIEW: Tablet Pilot Overview ── */}
      {state && (
        <TabletPilotOverview
          state={state}
          onNavigateToSection={handleNavigateToSection}
          onSendPilotResponse={handleSendPilotResponse}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      )}

      {/* ── SECOND SECTION: Detailed Cockpit Screens (Accessible below or via item tap) ── */}
      {state && (
        <section
          className={`detailed-screens-container ${activeTab === 'overview' ? 'overview-collapsed-preview' : 'active-full'}`}
          id="detailed-cockpit-screens"
          aria-label="Detailed Cockpit Systems"
        >
          <div className="detailed-section-header">
            <div className="detailed-section-title">
              <span className="section-title-glyph">⚙</span>
              <h2>Detailed Cockpit Screens &amp; Systems</h2>
            </div>
            <div className="detailed-section-meta">
              <span>Deep-dive flight management, routing diffs, and ATIS observations</span>
              <button
                className="toggle-detailed-btn"
                onClick={() => setActiveTab(activeTab === 'overview' ? 'detailed' : 'overview')}
              >
                {activeTab === 'detailed' ? '▲ Switch to Tablet Overview' : '▼ Expand Full Detailed Views'}
              </button>
            </div>
          </div>

          <main className="dashboard-grid" role="main" id="cockpit-dashboard">
            {/* Detailed Card 1: Arrival & Sequencing Overview */}
            <div className={`grid-full-width ${highlightedCardId === 'arrival-overview-panel' ? 'target-pulse-highlight' : ''}`}>
              <ArrivalOverviewCard
                sequence={state.landingSequence}
                holding={state.holding}
                aircraft={state.aircraft}
                isStale={isDatalinkStale}
              />
            </div>

            {/* Detailed Card 2: Aircraft Avionics Telemetry */}
            <div className={`grid-col-half ${highlightedCardId === 'aircraft-telemetry-panel' ? 'target-pulse-highlight' : ''}`}>
              <AircraftTelemetryCard
                aircraft={state.aircraft}
                isStale={isDatalinkStale}
              />
            </div>

            {/* Detailed Card 3: Aircraft Fuel & Delay */}
            <div className={`grid-col-half ${highlightedCardId === 'fuel-delay-panel' ? 'target-pulse-highlight' : ''}`}>
              <FuelCard
                fuel={state.aircraft.fuel}
                isStale={isDatalinkStale}
              />
            </div>

            {/* Detailed Card 4: Proposed Tactical Reroute */}
            <div className={`grid-col-half ${highlightedCardId === 'reroute-panel' ? 'target-pulse-highlight' : ''}`}>
              <RerouteCard
                reroute={state.reroute}
                onPilotAccept={handlePilotAcceptReroute}
                onPilotUnable={handlePilotUnableReroute}
                isStale={isDatalinkStale}
              />
            </div>

            {/* Detailed Card 5: Airport Conditions & Runway */}
            <div className={`grid-col-half ${highlightedCardId === 'arrival-conditions-panel' ? 'target-pulse-highlight' : ''}`}>
              <ArrivalConditionsCard
                conditions={state.conditions}
                isStale={isDatalinkStale}
              />
            </div>

            {/* Detailed Card 6: Operational Notices */}
            <div className={`grid-col-half ${highlightedCardId === 'operational-notices-panel' ? 'target-pulse-highlight' : ''}`}>
              <OperationalNoticesCard
                notices={state.notices}
                isStale={isDatalinkStale}
              />
            </div>

            {/* Detailed Card 7: Air-Ground Datalink Comms */}
            <div className={`grid-col-half ${highlightedCardId === 'ground-messages-panel' ? 'target-pulse-highlight' : ''}`}>
              <MessagesPanel
                messages={state.messages}
                flightId={state.flightId}
              />
            </div>
          </main>
        </section>
      )}

      {/* ── Cockpit Footer ── */}
      <footer className="cockpit-footer">
        <div className="footer-left">
          <span>Honey B AMS Prototype · UAE Hackathon 2026</span>
          <span className="footer-separator">|</span>
          <span>Dual Source Fusion: Aircraft FMS &amp; Ground AMAN</span>
        </div>
        <div className="footer-right">
          <span>Active Scenario: <strong>{scenario.replace(/_/g, ' ')}</strong></span>
          <span className="footer-separator">|</span>
          <span>Datalink: {state?.connectionStatus}</span>
        </div>
      </footer>
    </div>
  );
}
