import { useState } from 'react';
import type { RerouteData } from '../types';
import { formatUtcTime } from '../utils/format';

interface Props {
  reroute?: RerouteData;
  onPilotAccept: () => void;
  onPilotUnable: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  PROPOSED: 'PROPOSED',
  AWAITING_RESPONSE: 'AWAITING RESPONSE',
  ACCEPTED_BY_PILOT: 'ACCEPTED BY PILOT',
  CLEARED: 'CLEARED BY ATC',
};

const STATUS_CLASS: Record<string, string> = {
  PROPOSED: 'proposed',
  AWAITING_RESPONSE: 'awaiting',
  ACCEPTED_BY_PILOT: 'accepted',
  CLEARED: 'cleared',
};

export function RerouteCard({ reroute, onPilotAccept, onPilotUnable }: Props) {
  const [confirmed, setConfirmed] = useState<'accept' | 'unable' | null>(null);

  if (!reroute) {
    return (
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <span className="card-title-icon">⇄</span>
            Reroute
          </div>
          <span className="card-badge" style={{ color: 'var(--text-muted)', background: 'var(--bg-surface)' }}>
            NONE ACTIVE
          </span>
        </div>
        <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
          No reroute proposed
        </div>
      </div>
    );
  }

  const handleAccept = () => {
    setConfirmed('accept');
    onPilotAccept();
  };

  const handleUnable = () => {
    setConfirmed('unable');
    onPilotUnable();
  };

  const impact = reroute.estimatedTimeImpactMin;
  const impactColor = impact === undefined ? 'var(--text-muted)'
    : impact > 0 ? 'var(--color-high)' : 'var(--color-live)';
  const impactLabel = impact === undefined ? '—'
    : impact > 0 ? `+${impact} min` : `${impact} min`;

  return (
    <div className="card" style={{ borderColor: reroute ? 'rgba(245, 197, 24, 0.2)' : undefined }}>
      <div className="card-header">
        <div className="card-title">
          <span className="card-title-icon">⇄</span>
          Reroute
        </div>
        <span className={`reroute-status-badge ${STATUS_CLASS[reroute.status]}`}>
          {STATUS_LABELS[reroute.status]}
        </span>
      </div>

      {/* Routes side by side */}
      <div className="reroute-panel">
        <div className="route-block">
          <div className="route-block-label">Current Cleared Route</div>
          <div className="route-text">{reroute.clearedRoute}</div>
        </div>
        {reroute.proposedRoute && (
          <div className="route-block proposed">
            <div className="route-block-label">Proposed Route</div>
            <div className="route-text">{reroute.proposedRoute}</div>
          </div>
        )}
      </div>

      {/* Details */}
      <div style={{ marginTop: 'var(--space-md)' }}>
        {reroute.proposedRouteReason && (
          <div className="data-row">
            <span className="data-label">Reason</span>
            <span className="data-value" style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-secondary)', maxWidth: '60%' }}>
              {reroute.proposedRouteReason}
            </span>
          </div>
        )}
        {reroute.proposedRouteDiff && (
          <div className="data-row">
            <span className="data-label">Route Diff</span>
            <span className="data-value muted">{reroute.proposedRouteDiff}</span>
          </div>
        )}
        <div className="data-row">
          <span className="data-label">Time Impact</span>
          <span className="data-value" style={{ color: impactColor }}>
            {impactLabel}
          </span>
        </div>
        {reroute.proposedAtUtc && (
          <div className="data-row">
            <span className="data-label">Proposed At</span>
            <span className="data-value muted">{formatUtcTime(reroute.proposedAtUtc)}</span>
          </div>
        )}
      </div>

      {/* Action buttons — only when awaiting pilot response */}
      {reroute.status === 'AWAITING_RESPONSE' && !confirmed && (
        <>
          <div className="divider" />
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 8, fontStyle: 'italic' }}>
            Note: Accepting does not change your cleared route — ATC must issue a new clearance.
          </div>
          <div className="reroute-actions">
            <button className="reroute-action-btn accept" onClick={handleAccept}>
              ✓ Pilot Accepts (Advisory)
            </button>
            <button className="reroute-action-btn unable" onClick={handleUnable}>
              ✕ Unable
            </button>
          </div>
        </>
      )}

      {confirmed === 'accept' && (
        <div style={{
          marginTop: 'var(--space-md)',
          padding: 'var(--space-sm) var(--space-md)',
          background: 'rgba(34,197,94,0.08)',
          border: '1px solid rgba(34,197,94,0.3)',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.78rem',
          color: 'var(--color-live)',
        }}>
          ✓ Advisory acceptance sent to ATC. Await formal clearance before changing route.
        </div>
      )}

      {confirmed === 'unable' && (
        <div style={{
          marginTop: 'var(--space-md)',
          padding: 'var(--space-sm) var(--space-md)',
          background: 'var(--color-critical-bg)',
          border: '1px solid var(--color-critical-border)',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.78rem',
          color: 'var(--color-critical)',
        }}>
          ✕ Unable response sent to ATC. Current cleared route remains active.
        </div>
      )}
    </div>
  );
}
