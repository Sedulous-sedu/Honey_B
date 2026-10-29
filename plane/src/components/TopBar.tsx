import type { AircraftData, ConnectionStatus } from '../types';
import { ConnectionBadge } from './ConnectionBadge';
import { LiveClock } from './LiveClock';

interface Props {
  aircraft?: AircraftData;
  connectionStatus: ConnectionStatus;
  lastSeenUtc: string;
}

export function TopBar({ aircraft, connectionStatus, lastSeenUtc }: Props) {
  return (
    <header className="topbar" role="banner">
      <div className="topbar-brand">
        <span className="topbar-brand-icon">✈</span>
        <div>
          <div className="topbar-brand-text">FlightDeck AMS</div>
          <div className="topbar-brand-sub">Pilot In-Plane Decision Support</div>
        </div>
      </div>

      {aircraft && (
        <>
          <div className="topbar-flight-badge">
            <span className="topbar-flight-id">{aircraft.flightId}</span>
            <span className="topbar-flight-type">{aircraft.aircraftType}</span>
          </div>

          <div className="topbar-route">
            <span className="route-icao">{aircraft.originIcao}</span>
            <span className="topbar-route-arrow">→</span>
            <span className="route-icao">{aircraft.destinationIcao}</span>
            <span className="topbar-callsign">({aircraft.callsign})</span>
          </div>
        </>
      )}

      {/* Dual Information Source Indicator */}
      <div className="topbar-sources-legend">
        <div className="source-legend-item">
          <span className="source-legend-dot dot-aircraft" />
          <span>Aircraft FMS</span>
        </div>
        <div className="source-legend-item">
          <span className="source-legend-dot dot-ground" />
          <span>Ground AMAN</span>
        </div>
      </div>

      <div className="topbar-spacer" />

      <ConnectionBadge status={connectionStatus} lastSeenUtc={lastSeenUtc} />
      <LiveClock />
    </header>
  );
}
