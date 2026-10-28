import { useState } from 'react';
import type { GroundProposedReroute } from '../types';
import { formatUtcTime, ageLabel } from '../utils/format';

interface Props {
  reroute?: GroundProposedReroute;
  onPilotAccept: (rerouteId: string) => void;
  onPilotUnable: (rerouteId: string) => void;
  isStale?: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  PROPOSED: 'PROPOSED BY ATC',
  AWAITING_RESPONSE: 'AWAITING PILOT RESPONSE',
  ACCEPTED_BY_PILOT: 'ACCEPTED BY PILOT (ADVISORY)',
  CLEARED: 'CLEARED BY ATC',
};

const STATUS_CLASS: Record<string, string> = {
  PROPOSED: 'proposed',
  AWAITING_RESPONSE: 'awaiting',
  ACCEPTED_BY_PILOT: 'accepted',
  CLEARED: 'cleared',
};

export function RerouteCard({ reroute, onPilotAccept, onPilotUnable, isStale }: Props) {
  const [pilotFeedback, setPilotFeedback] = useState<'accept' | 'unable' | null>(null);

  if (!reroute) {
    return (
      <div className="card" id="reroute-panel">
        <div className="card-header">
          <div className="card-title">
            <span className="card-title-icon">⇄</span>
            <span>Proposed Reroute Review</span>
          </div>
          <div className="source-tag source-ground">
            <span className="source-dot" />
            <span>SOURCE: GROUND CONTROL</span>
          </div>
        </div>
        <div className="empty-card-state">
          <div style={{ fontSize: '1.2rem', marginBottom: 4 }}>✓</div>
          <div>No tactical reroute proposed</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Operative cleared route remains active
          </div>
        </div>
      </div>
    );
  }

  const handleAccept = () => {
    setPilotFeedback('accept');
    onPilotAccept(reroute.id);
  };

  const handleUnable = () => {
    setPilotFeedback('unable');
    onPilotUnable(reroute.id);
  };

  const impact = reroute.estimatedTimeImpactMin;
  const impactColor = impact > 0 ? 'var(--color-high)' : impact < 0 ? 'var(--color-live)' : 'var(--text-muted)';
  const impactLabel = impact > 0 ? `+${impact} min` : impact < 0 ? `${impact} min` : '0 min';

  return (
    <div className={`card ${isStale ? 'stale' : ''}`} id="reroute-panel" style={{ borderColor: 'rgba(245, 197, 24, 0.35)' }}>
      {/* Header */}
      <div className="card-header">
        <div className="card-title">
          <span className="card-title-icon">⇄</span>
          <span>Tactical Reroute Proposal</span>
        </div>
        <div className="source-tag source-ground">
          <span className="source-dot" />
          <span>SOURCE: GROUND CONTROL</span>
        </div>
      </div>

      <div className="card-subhead">
        <span className={`reroute-status-badge ${STATUS_CLASS[reroute.status]}`}>
          {STATUS_LABELS[reroute.status]}
        </span>
        <span className="card-updated-time">
          Proposed {formatUtcTime(reroute.proposedAtUtc)} ({ageLabel(reroute.proposedAtUtc)})
        </span>
      </div>

      {/* CRITICAL SAFETY DISCLAIMER */}
      <div className="safety-callout-strip">
        <span className="safety-icon">⚠</span>
        <div>
          <strong>ADVISORY ONLY — PROPOSED REROUTE IS NOT A CLEARED ROUTE</strong>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
            Pilot acceptance transmits advisory intent to Ground Control. Operative route remains UNCHANGED until ATC issues a formal voice or CPDLC route clearance.
          </div>
        </div>
      </div>

      {/* Side-by-Side Current vs Proposed Routes */}
      <div className="reroute-panel-comparison" style={{ marginTop: 'var(--space-md)' }}>
        <div className="route-block current">
          <div className="route-block-header">
            <span className="route-block-label">CURRENT CLEARED ROUTE</span>
            <span className="route-block-badge cleared">OPERATIVE</span>
          </div>
          <div className="route-text">{reroute.currentClearedRoute}</div>
        </div>

        <div className="route-block proposed">
          <div className="route-block-header">
            <span className="route-block-label">PROPOSED TACTICAL REROUTE</span>
            <span className="route-block-badge advisory">ADVISORY</span>
          </div>
          <div className="route-text highlight-proposed">{reroute.proposedRoute}</div>
        </div>
      </div>

      {/* Route Diff & Time Impact */}
      <div className="detail-rows-block" style={{ marginTop: 'var(--space-md)' }}>
        <div className="data-row">
          <span className="data-label">Waypoint Diff</span>
          <span className="data-value highlight-cyan" style={{ fontFamily: 'var(--font-data)', fontSize: '0.8rem' }}>
            {reroute.routeDiff}
          </span>
        </div>

        <div className="data-row">
          <span className="data-label">Ground ATC Reason</span>
          <span className="data-value" style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', maxWidth: '65%', textAlign: 'right' }}>
            {reroute.reason}
          </span>
        </div>

        <div className="data-row">
          <span className="data-label">Estimated Time Impact</span>
          <span className="data-value" style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700, color: impactColor }}>
            {impactLabel}
          </span>
        </div>
      </div>

      {/* Action Buttons for Pilot Response */}
      {(reroute.status === 'AWAITING_RESPONSE' || reroute.status === 'PROPOSED') && !pilotFeedback && (
        <div className="reroute-action-zone">
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 8, fontStyle: 'italic' }}>
            Select pilot response to downlink intent to Ground Control:
          </div>
          <div className="reroute-actions">
            <button
              className="reroute-action-btn accept"
              onClick={handleAccept}
              title="Acknowledge proposal and signal advisory willingness to accept upon formal clearance"
            >
              ✓ Pilot Accepts (Advisory Intent)
            </button>
            <button
              className="reroute-action-btn unable"
              onClick={handleUnable}
              title="Advise ATC unable to comply; maintain current cleared route"
            >
              ✕ Unable (Maintain Current Route)
            </button>
          </div>
        </div>
      )}

      {/* Pilot Feedback Banner */}
      {(pilotFeedback === 'accept' || reroute.status === 'ACCEPTED_BY_PILOT') && (
        <div className="pilot-intent-feedback accepted">
          ✓ <strong>Advisory Acceptance Transmitted to Ground Control</strong>
          <div>
            Stand by for formal ATC clearance before altering FMS navigation. Cleared route remains operative.
          </div>
        </div>
      )}

      {pilotFeedback === 'unable' && (
        <div className="pilot-intent-feedback unable">
          ✕ <strong>"Unable" Response Transmitted to Ground Control</strong>
          <div>
            Downlinked non-compliance advisory. Current cleared route remains operative without change.
          </div>
        </div>
      )}
    </div>
  );
}
