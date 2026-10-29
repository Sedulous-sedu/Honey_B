import type { OperationalNotice } from '../types';
import { formatUtcTime, ageLabel } from '../utils/format';

interface Props {
  notices: OperationalNotice[];
  isStale?: boolean;
}

const URGENCY_ICONS: Record<string, string> = {
  CRITICAL: '🔴',
  HIGH: '🟠',
  MEDIUM: '🟡',
  LOW: '🔵',
  INFO: '⚪',
};

const URGENCY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

export function NoticesCard({ notices, isStale }: Props) {
  const sorted = [...notices].sort((a, b) => {
    const urgDiff = (URGENCY_ORDER[a.urgency] ?? 5) - (URGENCY_ORDER[b.urgency] ?? 5);
    if (urgDiff !== 0) return urgDiff;
    return new Date(b.issuedAtUtc).getTime() - new Date(a.issuedAtUtc).getTime();
  });

  const critCount = notices.filter((n) => n.urgency === 'CRITICAL').length;
  const highCount = notices.filter((n) => n.urgency === 'HIGH').length;

  return (
    <div className={`card ${critCount > 0 ? 'critical' : ''}`} style={isStale ? { opacity: 0.75 } : undefined}>
      <div className="card-header">
        <div className="card-title">
          <span className="card-title-icon">📋</span>
          Operational Notices
        </div>
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
              {notices.length} NOTICE{notices.length !== 1 ? 'S' : ''}
            </span>
          )}
        </div>
      </div>

      <div style={{
        fontSize: '0.6rem',
        color: 'var(--text-muted)',
        fontStyle: 'italic',
        marginBottom: 'var(--space-sm)',
        padding: '3px 8px',
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-sm)',
        display: 'inline-block',
      }}>
        ⚠ SIMULATION ONLY — Not certified avionics. These are prototype notices.
      </div>

      <div className="notices-list">
        {sorted.map((n) => (
          <div key={n.id} className={`notice-item ${n.urgency.toLowerCase()}`}>
            <div className="notice-urgency-badge">
              <span className="notice-urgency-icon">{URGENCY_ICONS[n.urgency]}</span>
              <span className="notice-urgency-label">{n.urgency}</span>
            </div>
            <div className="notice-content">
              <div className="notice-title">
                {n.title}
                {n.isStale && (
                  <span className="notice-stale-tag" style={{ marginLeft: 6 }}>⚠ STALE</span>
                )}
              </div>
              <div className="notice-body">{n.body}</div>
              <div className="notice-meta">
                <span>{n.source}</span>
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
