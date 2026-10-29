import type { FlightData } from '../types';
import {
  fmtAlt,
  fmtKts,
  fmtNm,
  formatUtcTime,
  phaseLabel,
  etaDeltaMin,
  formatDeltaMin,
} from '../utils/format';

interface Props {
  flight: FlightData;
  isStale?: boolean;
}

export function FlightContextCard({ flight, isStale }: Props) {
  const delta = etaDeltaMin(flight.etaUtc, flight.previousEtaUtc);
  const deltaLabel = formatDeltaMin(delta);
  const deltaClass =
    delta === null || delta === 0 ? 'neutral' : delta > 0 ? 'positive' : 'negative';

  const phaseClass = flight.phase === 'HOLDING' ? 'holding' : '';

  return (
    <div className={`card ${isStale ? 'stale' : ''}`}>
      <div className="card-header">
        <div className="card-title">
          <span className="card-title-icon">✈</span>
          Flight Context
        </div>
        <span className={`phase-badge ${phaseClass}`}>
          {phaseLabel(flight.phase)}
        </span>
      </div>

      {isStale && (
        <div className="stale-banner">
          <span className="stale-banner-icon">⚠</span>
          <span>Flight data is stale — last contact {formatUtcTime(flight.etaUpdatedAtUtc)}</span>
        </div>
      )}

      {/* Primary metrics */}
      <div className="data-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 'var(--space-md)' }}>
        <div className="metric-tile">
          <span className="metric-tile-label">Altitude</span>
          <span className="metric-tile-value" style={{ color: 'var(--color-primary)' }}>
            {fmtAlt(flight.altitudeFt)}
          </span>
        </div>
        <div className="metric-tile">
          <span className="metric-tile-label">Airspeed</span>
          <span className="metric-tile-value">{fmtKts(flight.airspeedKts)}</span>
          <span className="metric-tile-sub">GS {fmtKts(flight.groundspeedKts)}</span>
        </div>
        <div className="metric-tile">
          <span className="metric-tile-label">Remaining</span>
          <span className="metric-tile-value">{fmtNm(flight.remainingDistanceNm)}</span>
        </div>
      </div>

      {/* ETA block */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)', marginBottom: 'var(--space-md)' }}>
        <div className="data-row">
          <span className="data-label">ETA (dest)</span>
          <span className="data-value" style={{ fontFamily: 'var(--font-data)', fontSize: '1.1rem', color: 'var(--color-primary)' }}>
            {formatUtcTime(flight.etaUtc)}
          </span>
        </div>
        {flight.previousEtaUtc && (
          <div className="data-row">
            <span className="data-label">Previous ETA</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <span className="data-value muted">{formatUtcTime(flight.previousEtaUtc)}</span>
              <span className={`eta-delta ${deltaClass}`}>
                {delta !== null && delta > 0 ? '▲' : delta !== null && delta < 0 ? '▼' : ''}
                {' '}{deltaLabel}
              </span>
            </div>
          </div>
        )}
        {flight.etaChangeReasonText && (
          <div style={{
            fontSize: '0.72rem',
            color: 'var(--text-muted)',
            fontStyle: 'italic',
            padding: '4px 8px',
            background: 'var(--bg-surface)',
            borderRadius: 'var(--radius-sm)',
          }}>
            {flight.etaChangeReasonText}
          </div>
        )}
        <div className="data-row">
          <span className="data-label">ETA calc'd</span>
          <span className="data-value muted">{formatUtcTime(flight.etaUpdatedAtUtc)}</span>
        </div>
      </div>

      {/* Route */}
      <div style={{ marginBottom: 'var(--space-sm)' }}>
        <div className="data-label" style={{ marginBottom: 4 }}>Planned Route</div>
        <div style={{
          fontFamily: 'var(--font-data)',
          fontSize: '0.75rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
          wordBreak: 'break-all',
          padding: '6px 8px',
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-sm)',
        }}>
          {flight.plannedRoute}
        </div>
      </div>
    </div>
  );
}
