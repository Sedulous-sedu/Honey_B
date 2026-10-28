import type { AircraftData } from '../types';
import {
  fmtAlt,
  fmtKts,
  fmtNm,
  formatUtcTime,
  phaseLabel,
  ageLabel,
} from '../utils/format';

interface Props {
  aircraft: AircraftData;
  isStale?: boolean;
}

export function AircraftTelemetryCard({ aircraft, isStale }: Props) {
  const phaseClass = aircraft.flightPhase === 'HOLDING' ? 'holding' : '';

  return (
    <div className={`card ${isStale ? 'stale' : ''}`} id="aircraft-telemetry-panel">
      {/* Header with Source & Last Updated */}
      <div className="card-header">
        <div className="card-title">
          <span className="card-title-icon">✈</span>
          <span>Aircraft Telemetry</span>
        </div>
        <div className="source-tag source-aircraft">
          <span className="source-dot" />
          <span>SOURCE: AIRCRAFT (FMS / SENSORS)</span>
        </div>
      </div>

      <div className="card-subhead">
        <span className={`phase-badge ${phaseClass}`}>
          {phaseLabel(aircraft.flightPhase)}
        </span>
        <span className="card-updated-time">
          Updated {formatUtcTime(aircraft.lastUpdatedUtc)} ({ageLabel(aircraft.lastUpdatedUtc)})
        </span>
      </div>

      {isStale && (
        <div className="stale-banner">
          <span className="stale-banner-icon">⚠</span>
          <span>Avionics telemetry is stale — verify sensor health</span>
        </div>
      )}

      {/* Primary Flight Instrument Metrics */}
      <div className="data-grid telemetry-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 'var(--space-md)' }}>
        <div className="metric-tile">
          <span className="metric-tile-label">Altitude</span>
          <span className="metric-tile-value" style={{ color: 'var(--color-primary)' }}>
            {fmtAlt(aircraft.altitudeFt)}
          </span>
          <span className="metric-tile-sub">
            V/S {aircraft.verticalSpeedFpm > 0 ? `+${aircraft.verticalSpeedFpm}` : aircraft.verticalSpeedFpm} fpm
          </span>
        </div>

        <div className="metric-tile">
          <span className="metric-tile-label">Speed</span>
          <span className="metric-tile-value">{fmtKts(aircraft.indicatedAirspeedKts)} <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>IAS</span></span>
          <span className="metric-tile-sub">
            GS {fmtKts(aircraft.groundspeedKts)} · M{aircraft.mach.toFixed(2)}
          </span>
        </div>

        <div className="metric-tile">
          <span className="metric-tile-label">Heading & Dist</span>
          <span className="metric-tile-value" style={{ fontFamily: 'var(--font-data)' }}>
            {String(aircraft.position.headingDegTrue).padStart(3, '0')}° <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>TRUE</span>
          </span>
          <span className="metric-tile-sub">
            {fmtNm(aircraft.position.remainingDistanceNm)} to dest
          </span>
        </div>
      </div>

      {/* Position Coordinates & Aircraft Details */}
      <div className="detail-rows-block">
        <div className="data-row">
          <span className="data-label">Aircraft / Callsign</span>
          <span className="data-value" style={{ fontFamily: 'var(--font-data)' }}>
            {aircraft.callsign} ({aircraft.aircraftType})
          </span>
        </div>

        <div className="data-row">
          <span className="data-label">Current Position</span>
          <span className="data-value muted" style={{ fontFamily: 'var(--font-data)', fontSize: '0.78rem' }}>
            {aircraft.position.formattedCoordinates}
          </span>
        </div>

        <div className="data-row">
          <span className="data-label">Aircraft FMS ETA</span>
          <span className="data-value highlight-cyan" style={{ fontFamily: 'var(--font-data)', fontSize: '1rem', fontWeight: 700 }}>
            {formatUtcTime(aircraft.fmsEtaUtc)}
          </span>
        </div>
      </div>

      {/* Current Operative Cleared Route */}
      <div style={{ marginTop: 'var(--space-sm)' }}>
        <div className="data-label" style={{ marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
          <span>Current Cleared Route (FMS)</span>
          <span style={{ fontSize: '0.65rem', color: 'var(--color-live)' }}>OPERATIVE</span>
        </div>
        <div className="route-display-box">
          {aircraft.currentClearedRoute}
        </div>
      </div>
    </div>
  );
}
