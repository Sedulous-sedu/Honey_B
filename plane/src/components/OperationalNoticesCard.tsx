import type { GroundOperationalNotice, NoticeUrgency } from '../types';
import { formatUtcTime, ageLabel } from '../utils/format';

interface Props {
  notices: GroundOperationalNotice[];
  isStale?: boolean;
}

const URGENCY_ICONS: Record<NoticeUrgency, string> = {
  CRITICAL: '🔴',
  HIGH: '🟠',
  MEDIUM: '🟡',
  LOW: '🔵',
  INFO: '⚪',
};

const URGENCY_RANK: Record<NoticeUrgency, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

export function OperationalNoticesCard({ notices, isStale }: Props) {
  // Sorted strictly by urgency (CRITICAL -> HIGH -> MEDIUM -> LOW -> INFO), then timestamp
  const sorted = [...notices].sort((a, b) => {
    const rankDiff = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
    if (rankDiff !== 0) return rankDiff;
    return new Date(b.issuedAtUtc).getTime() - new Date(a.issuedAtUtc).getTime();
  });

  const critCount = notices.filter((n) => n.urgency === 'CRITICAL').length;
  const highCount = notices.filter((n) => n.urgency === 'HIGH').length;

  return (
    <div className={`card ${critCount > 0 ? 'critical' : ''} ${isStale ? 'stale' : ''}`} id="operational-notices-panel">
      {/* Header */}
      <div className="card-header">
        <div className="card-title">
          <span className="card-title-icon">📋</span>
          <span>Operational Notices</span>
        </div>
        <div className="source-tag source-ground">
          <span className="source-dot" />
          <span>SOURCE: GROUND CONTROL</span>
        </div>
      </div>

      <div className="card-subhead">
        <div style={{ display: 'flex', gap: 6 }}>
          {critCount > 0 && (
            <span className="card-badge" style={{ color: 'var(--color-critical)', background: 'var(--color-critical-bg)', border: '1px solid var(--color-critical-border)' }}>
              {critCount} CRITICAL
            </span>
          )}
          {highCount > 0 && (
            <span className="card-badge" style={{ color: 'var(--color-high)', background: 'var(--color-high-bg)', border: '1px solid var(--color-high-border)' }}>
              {highCount} HIGH
            </span>
          )}
          {critCount === 0 && highCount === 0 && (
            <span className="card-badge" style={{ color: 'var(--text-muted)', background: 'var(--bg-surface)' }}>
              {notices.length} ACTIVE NOTICE{notices.length !== 1 ? 'S' : ''}
            </span>
          )}
        </div>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          Sorted by Urgency Priority
        </span>
      </div>

      {/* Safety Notice */}
      <div className="notice-simulation-banner">
        ⚠ SIMULATION DECISION-SUPPORT ONLY — Prototype notices for demonstration. Not certified avionics.
      </div>

      {/* List of notices */}
      <div className="notices-list">
        {sorted.map((n) => (
          <div key={n.id} className={`notice-item ${n.urgency.toLowerCase()}`}>
            {/* Visual Icon AND Explicit Text Label */}
            <div className={`notice-urgency-badge ${n.urgency.toLowerCase()}`}>
              <span className="notice-urgency-icon">{URGENCY_ICONS[n.urgency]}</span>
              <span className="notice-urgency-text">[{n.urgency}]</span>
            </div>

            <div className="notice-content">
              <div className="notice-title">
                {n.title}
                {n.isStale && (
                  <span className="notice-stale-tag">⚠ STALE</span>
                )}
              </div>
              <div className="notice-body">{n.body}</div>
              <div className="notice-meta">
                <span className="meta-source">{n.source}</span>
                <span>Issued {formatUtcTime(n.issuedAtUtc)} ({ageLabel(n.issuedAtUtc)})</span>
                {n.expiresUtc && <span>Expires {formatUtcTime(n.expiresUtc)}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
