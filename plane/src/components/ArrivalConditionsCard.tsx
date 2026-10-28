import type { GroundAirportConditions } from '../types';
import { formatWind, formatVis, formatUtcTime, ageLabel } from '../utils/format';

interface Props {
  conditions: GroundAirportConditions;
  isStale?: boolean;
}

function visCls(meters?: number): string {
  if (meters === undefined) return '';
  if (meters < 1500) return 'warning-critical';
  if (meters < 5000) return 'warning';
  return '';
}

function windCls(gust?: number): string {
  if (gust !== undefined && gust > 25) return 'warning-critical';
  return '';
}

export function ArrivalConditionsCard({ conditions, isStale }: Props) {
  const age = ageLabel(conditions.observedAtUtc);
  const isRunwayChanged = !!conditions.previousRunway && conditions.previousRunway !== conditions.activeRunway;

  return (
    <div className={`card ${isStale ? 'stale' : ''}`} id="arrival-conditions-panel">
      {/* Header */}
      <div className="card-header">
        <div className="card-title">
          <span className="card-title-icon">🌤</span>
          <span>Airport Conditions &amp; Runway</span>
        </div>
        <div className="source-tag source-ground">
          <span className="source-dot" />
          <span>SOURCE: GROUND (ATIS / METAR)</span>
        </div>
      </div>

      <div className="card-subhead">
        <span className="data-source-origin">{conditions.source}</span>
        <span className="card-updated-time">
          Observed {formatUtcTime(conditions.observedAtUtc)} ({age})
        </span>
      </div>

      {isStale && (
        <div className="stale-banner">
          <span className="stale-banner-icon">⚠</span>
          <span>Weather conditions are stale — request updated ATIS from Tower</span>
        </div>
      )}

      {/* Runway Change Alert Strip if Active */}
      {isRunwayChanged && (
        <div className="runway-change-alert-banner">
          <span className="alert-icon">⚠</span>
          <div>
            <strong>ACTIVE RUNWAY CHANGED: {conditions.previousRunway} → {conditions.activeRunway}</strong>
            <div style={{ fontSize: '0.72rem' }}>
              Changed at {formatUtcTime(conditions.runwayChangedAtUtc)} · Verify approach plates &amp; ILS frequency
            </div>
          </div>
        </div>
      )}

      {/* Primary Runway & Approach */}
      <div className="runway-approach-block" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 'var(--space-md)' }}>
        <div>
          <div className="data-label">Active Runway</div>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: '2.4rem',
            fontWeight: 700,
            color: 'var(--color-primary)',
            lineHeight: 1,
          }}>
            {conditions.activeRunway}
          </div>
        </div>

        <div style={{ paddingLeft: 16, borderLeft: '1px solid var(--border-subtle)', flex: 1 }}>
          <div className="data-label">Approach in Use</div>
          <div style={{ fontFamily: 'var(--font-data)', fontSize: '0.95rem', color: 'var(--color-live)', fontWeight: 600 }}>
            {conditions.approachType}
          </div>
          {conditions.surfaceConditionCode && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
              Surface: {conditions.surfaceConditionCode}
            </div>
          )}
        </div>
      </div>

      {/* Weather Grid */}
      <div className="wx-grid">
        <div className="wx-tile">
          <span className="wx-tile-label">Surface Wind</span>
          <span className={`wx-tile-value ${windCls(conditions.gustKts)}`}>
            {formatWind(conditions.windDirectionDeg, conditions.windSpeedKts, conditions.gustKts)}
          </span>
          {conditions.gustKts && (
            <span className="metric-tile-sub" style={{ color: 'var(--color-high)' }}>
              Gusts to {conditions.gustKts} kt
            </span>
          )}
        </div>

        <div className="wx-tile">
          <span className="wx-tile-label">Visibility</span>
          <span className={`wx-tile-value ${visCls(conditions.visibilityMeters)}`}>
            {formatVis(conditions.visibilityMeters)}
          </span>
          {conditions.visibilityMeters !== undefined && conditions.visibilityMeters < 1500 && (
            <span className="metric-tile-sub" style={{ color: 'var(--color-critical)' }}>
              LVP Active
            </span>
          )}
        </div>

        <div className="wx-tile">
          <span className="wx-tile-label">Cloud Ceiling</span>
          <span className="wx-tile-value">{conditions.cloudBase}</span>
        </div>

        <div className="wx-tile">
          <span className="wx-tile-label">Altimeter (QNH)</span>
          <span className="wx-tile-value" style={{ fontFamily: 'var(--font-data)' }}>
            {conditions.qnhHpa} hPa
          </span>
        </div>

        <div className="wx-tile">
          <span className="wx-tile-label">Temp / Dewpoint</span>
          <span className="wx-tile-value">
            {conditions.temperatureC !== undefined ? `${conditions.temperatureC}°` : '—'}
            {conditions.dewpointC !== undefined ? ` / ${conditions.dewpointC}°C` : ''}
          </span>
        </div>

        <div className="wx-tile">
          <span className="wx-tile-label">Data Source</span>
          <span className="wx-tile-value" style={{ fontSize: '0.78rem' }}>
            {conditions.source}
          </span>
          <span className="metric-tile-sub">Obs: {formatUtcTime(conditions.observedAtUtc)}</span>
        </div>
      </div>

      {/* NOTAMs & Surface Bulletins */}
      {conditions.notams && conditions.notams.length > 0 && (
        <div style={{ marginTop: 'var(--space-sm)' }}>
          <div className="data-label" style={{ marginBottom: 4 }}>Runway NOTAMs &amp; Operational Advisories</div>
          <ul className="notam-list">
            {conditions.notams.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
