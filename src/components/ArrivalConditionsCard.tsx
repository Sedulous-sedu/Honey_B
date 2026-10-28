import type { ArrivalConditions } from '../types';
import { formatWind, formatVis, formatUtcTime, ageLabel } from '../utils/format';

interface Props {
  conditions: ArrivalConditions;
  isStale?: boolean;
}

function visCls(meters?: number): string {
  if (meters === undefined) return '';
  if (meters < 800) return 'warning';
  if (meters < 3000) return 'warning';
  return '';
}

function windCls(gust?: number): string {
  if (gust !== undefined && gust > 25) return 'warning';
  return '';
}

export function ArrivalConditionsCard({ conditions, isStale }: Props) {
  const age = ageLabel(conditions.observedAtUtc);
  const ageMin = Math.floor((Date.now() - new Date(conditions.observedAtUtc).getTime()) / 60000);
  const isOld = ageMin > 30 || isStale;

  return (
    <div className={`card ${isOld ? 'stale' : ''}`}>
      <div className="card-header">
        <div className="card-title">
          <span className="card-title-icon">🌤</span>
          Arrival Conditions
        </div>
        <div className="data-label" style={{ fontSize: '0.68rem' }}>
          {conditions.source}
        </div>
      </div>

      {isStale && (
        <div className="stale-banner">
          <span className="stale-banner-icon">⚠</span>
          <span>Conditions data stale — last contact {formatUtcTime(conditions.observedAtUtc)}</span>
        </div>
      )}

      {/* Runway & approach */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 'var(--space-md)' }}>
        <div>
          <div className="data-label">Active Runway</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 700, color: 'var(--color-primary)', lineHeight: 1 }}>
            {conditions.activeRunway}
          </div>
        </div>
        {conditions.ilsApproach && (
          <div style={{ paddingLeft: 12, borderLeft: '1px solid var(--border-subtle)' }}>
            <div className="data-label">Approach</div>
            <div style={{ fontFamily: 'var(--font-data)', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              {conditions.ilsApproach}
            </div>
          </div>
        )}
      </div>

      {/* WX grid */}
      <div className="wx-grid">
        <div className="wx-tile">
          <span className="wx-tile-label">Wind</span>
          <span className={`wx-tile-value ${windCls(conditions.gustKts)}`}>
            {formatWind(conditions.windDirectionDeg, conditions.windSpeedKts, conditions.gustKts)}
          </span>
        </div>
        <div className="wx-tile">
          <span className="wx-tile-label">Visibility</span>
          <span className={`wx-tile-value ${visCls(conditions.visibilityMeters)}`}>
            {formatVis(conditions.visibilityMeters)}
          </span>
        </div>
        <div className="wx-tile">
          <span className="wx-tile-label">Cloud Base</span>
          <span className="wx-tile-value">{conditions.cloudBase ?? '—'}</span>
        </div>
        <div className="wx-tile">
          <span className="wx-tile-label">QNH</span>
          <span className="wx-tile-value">{conditions.qnh ? `${conditions.qnh} hPa` : '—'}</span>
        </div>
        <div className="wx-tile">
          <span className="wx-tile-label">Temp / Dewpoint</span>
          <span className="wx-tile-value">
            {conditions.temperatureCelsius !== undefined ? `${conditions.temperatureCelsius}°` : '—'}
            {conditions.dewpointCelsius !== undefined ? ` / ${conditions.dewpointCelsius}°C` : ''}
          </span>
        </div>
        <div className="wx-tile">
          <span className="wx-tile-label">Observed</span>
          <span className="wx-tile-value" style={{ fontSize: '0.8rem' }}>{formatUtcTime(conditions.observedAtUtc)}</span>
          <span className="metric-tile-sub">{age}</span>
        </div>
      </div>

      {/* NOTAMs */}
      {conditions.notams && conditions.notams.length > 0 && (
        <>
          <div className="data-label" style={{ marginBottom: 'var(--space-xs)' }}>NOTAMs / Notices</div>
          <ul className="notam-list">
            {conditions.notams.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </>
      )}

      <div className="source-row">
        <span>Source: {conditions.source}</span>
        <span>Observed: {formatUtcTime(conditions.observedAtUtc)} ({age})</span>
      </div>
    </div>
  );
}
