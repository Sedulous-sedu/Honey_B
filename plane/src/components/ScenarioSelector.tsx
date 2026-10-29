import type { ScenarioName } from '../types';

interface Props {
  currentScenario: ScenarioName;
  onSelectScenario: (scenario: ScenarioName) => void;
}

const SCENARIOS: Array<{ id: ScenarioName; label: string; badge: string; description: string }> = [
  {
    id: 'NORMAL_ARRIVAL',
    label: 'Normal Arrival',
    badge: 'Nominal',
    description: 'Standard descent, sequence #4/11, minor rain at EGLL, live link',
  },
  {
    id: 'EXTENDED_HOLD',
    label: 'Extended Hold',
    badge: 'Hold Active',
    description: 'Ground stop at EGLL, holding at LAM, 48 min predicted delay, fuel concern',
  },
  {
    id: 'PROPOSED_REROUTE',
    label: 'Proposed Reroute',
    badge: 'Advisory',
    description: 'ATC proposes BIG DCT EGLL for spacing (+4 min), awaiting pilot response',
  },
  {
    id: 'RUNWAY_WEATHER_CHANGE',
    label: 'Rwy / Weather Change',
    badge: 'Critical WX',
    description: 'Runway changed 27R → 09L, wind shear alert, CAT II ILS, low visibility',
  },
  {
    id: 'LOST_CONNECTION',
    label: 'Lost Connection',
    badge: 'Degraded',
    description: 'Datalink dropped 22 min ago, all data visibly stale, revert to VHF voice',
  },
];

export function ScenarioSelector({ currentScenario, onSelectScenario }: Props) {
  return (
    <nav className="scenario-bar" aria-label="Demo scenarios">
      <div className="scenario-bar-title">
        <span className="demo-tag">HACKATHON DEMO</span>
        <span className="scenario-bar-label">Test Scenarios:</span>
      </div>

      <div className="scenario-btn-group">
        {SCENARIOS.map((s) => {
          const isActive = currentScenario === s.id;
          return (
            <button
              key={s.id}
              id={`scenario-btn-${s.id.toLowerCase().replace(/_/g, '-')}`}
              className={`scenario-btn ${isActive ? 'active' : ''}`}
              onClick={() => onSelectScenario(s.id)}
              title={s.description}
            >
              <span className="scenario-btn-text">{s.label}</span>
              <span className={`scenario-pill ${s.id.toLowerCase()}`}>{s.badge}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
