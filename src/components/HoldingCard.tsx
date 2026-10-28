import type { HoldingData } from '../types';
import { formatUtcTime } from '../utils/format';

interface Props {
  holding: HoldingData;
}

export function HoldingCard({ holding }: Props) {
  if (!holding.active) {
    return (
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <span className="card-title-icon">⟳</span>
            Holding
          </div>
          <span className="card-badge" style={{ color: 'var(--color-live)', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}>
            NOT ACTIVE
          </span>
        </div>
        <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
          No hold assigned
        </div>
      </div>
    );
  }

  const delayMin = holding.predictedRemainingDelayMin;
  const delayColor = delayMin !== undefined
    ? (delayMin > 40 ? 'var(--color-critical)' : delayMin > 20 ? 'var(--color-high)' : 'var(--color-medium)')
    : 'var(--text-muted)';

  return (
    <div className="card" style={{ borderColor: 'rgba(245, 197, 24, 0.25)' }}>
      <div className="card-header">
        <div className="card-title">
          <span className="card-title-icon">⟳</span>
          Holding
        </div>
        <span className="card-badge phase-badge holding" style={{ fontSize: '0.65rem' }}>
          ACTIVE HOLD
        </span>
      </div>

      {/* Hold fix & instructions */}
      <div className="holding-panel">
        {holding.fix && (
          <div className="holding-fix">{holding.fix}</div>
        )}
        {holding.instructions && (
          <div className="holding-instruction">{holding.instructions}</div>
        )}

        {/* EFC */}
        {holding.efcUtc && (
          <div className="holding-efc">
            <div style={{ flex: 1 }}>
              <div className="holding-efc-label">Expect Further Clearance (EFC)</div>
              <div className="holding-efc-time">{formatUtcTime(holding.efcUtc)}</div>
            </div>
            <span style={{
              fontSize: '0.62rem',
              color: 'var(--text-muted)',
              padding: '2px 6px',
              background: 'var(--bg-elevated)',
              borderRadius: 4,
            }}>
              ATC ISSUED
            </span>
          </div>
        )}
      </div>

      {/* Predicted delay — clearly labeled as non-ATC */}
      {delayMin !== undefined && (
        <div style={{ marginTop: 'var(--space-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div className="data-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: 'var(--color-primary)', fontSize: '0.65rem' }}>◆</span>
              Decision Support: Predicted Remaining Delay
            </div>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 6,
            marginBottom: 8,
          }}>
            <span style={{
              fontFamily: 'var(--font-display)',
              fontSize: '2.2rem',
              fontWeight: 700,
              color: delayColor,
              lineHeight: 1,
              textShadow: `0 0 20px ${delayColor}40`,
            }}>
              ~{delayMin}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>min</span>
          </div>

          <div className="holding-prediction-note">
            {holding.predictedDelayNote}
          </div>
        </div>
      )}
    </div>
  );
}
