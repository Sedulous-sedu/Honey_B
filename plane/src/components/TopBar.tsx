import type { AircraftData, ConnectionStatus } from '../types';
import { ConnectionBadge } from './ConnectionBadge';
import { LiveClock } from './LiveClock';

interface Props {
  aircraft?: AircraftData;
  connectionStatus: ConnectionStatus;
  lastSeenUtc: string;
  dataMode?: 'LIVE_OBSERVE' | 'REPLAY' | 'WHAT_IF' | 'FIXTURE_SIMULATION';
  providerHealth?: Array<{
    provider: string;
    status: 'ONLINE' | 'DEGRADED' | 'DISCONNECTED' | 'REPLAY';
    message?: string;
  }>;
}

export function TopBar({ aircraft, connectionStatus, lastSeenUtc, dataMode, providerHealth }: Props) {
  return (
    <header className="topbar" role="banner">
      <div className="topbar-brand">
        <div>
          <div className="topbar-brand-text">Honey B Pilot</div>
          <div className="topbar-brand-sub">Pilot display</div>
        </div>
      </div>

      {dataMode && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            style={{
              padding: '3px 8px',
              borderRadius: 6,
              fontSize: '0.72rem',
              fontWeight: 800,
              letterSpacing: '0.04em',
              border: '1px solid',
              borderColor:
                dataMode === 'LIVE_OBSERVE'
                  ? '#10b981'
                  : dataMode === 'REPLAY'
                  ? '#f59e0b'
                  : '#8b5cf6',
              color:
                dataMode === 'LIVE_OBSERVE'
                  ? '#34d399'
                  : dataMode === 'REPLAY'
                  ? '#fbbf24'
                  : '#c084fc',
              background: 'rgba(11, 31, 58, 0.85)',
            }}
            title={`Operational Mode: ${dataMode}`}
          >
            ● {dataMode}
          </div>
          {providerHealth && providerHealth.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: '0.68rem',
                color: '#94a3b8',
              }}
              title={providerHealth.map((p) => `${p.provider}: ${p.status}`).join(' | ')}
            >
              {providerHealth.map((p) => (
                <span
                  key={p.provider}
                  style={{
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: p.status === 'ONLINE' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: p.status === 'ONLINE' ? '#34d399' : '#f87171',
                    fontWeight: 700,
                  }}
                >
                  {p.provider.split('_')[0]}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {aircraft && (
        <>
          <div className="topbar-flight-badge" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {aircraft.identity?.operatingAirline?.logoAssetPath && (
              <div
                style={{
                  width: 44,
                  height: 26,
                  borderRadius: 5,
                  background: '#FFFFFF',
                  padding: '2px 4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid rgba(245, 166, 35, 0.5)',
                }}
                title={aircraft.identity.operatingAirline.name}
              >
                <img
                  src={aircraft.identity.operatingAirline.logoAssetPath}
                  alt={`${aircraft.identity.operatingAirline.name} logo`}
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            )}
            <span className="topbar-flight-id">{aircraft.identity?.callsignObserved || aircraft.flightId}</span>
            <span className="topbar-flight-type">{aircraft.aircraftType}</span>
          </div>

          <div className="topbar-route">
            <span className="route-icao">{aircraft.originIcao}</span>
            <span className="topbar-route-arrow">→</span>
            <span className="route-icao">{aircraft.destinationIcao}</span>
            <span className="topbar-callsign">
              ({aircraft.identity?.operatingAirline?.name || aircraft.callsign})
            </span>
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
