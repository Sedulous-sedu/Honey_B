import type { LandingSequence } from '../types';
import { formatUtcTime, ageLabel } from '../utils/format';

interface Props {
  sequence: LandingSequence;
  isStale?: boolean;
}

export function LandingSequenceCard({ sequence, isStale }: Props) {
  const dots = [];
  for (let i = 1; i <= sequence.totalInSequence; i++) {
    let cls = 'sequence-dot';
    if (i < sequence.sequenceNumber) cls += ' landed';
    else if (i === sequence.sequenceNumber) cls += ' mine';
    else cls += ' ahead';
    dots.push(
      <div key={i} className={cls} title={`Position ${i}`}>
        {i === sequence.sequenceNumber ? i : ''}
      </div>
    );
  }

  const statusColor =
    sequence.status === 'CONFIRMED' ? 'var(--color-live)' : 'var(--color-medium)';
  const statusLabel =
    sequence.status === 'CONFIRMED' ? '✓ CONFIRMED' : '~ ESTIMATED';

  return (
    <div className={`card ${isStale ? 'stale' : ''}`}>
      <div className="card-header">
        <div className="card-title">
          <span className="card-title-icon">🛬</span>
          Landing Sequence
        </div>
        <span
          className="card-badge"
          style={{ color: statusColor, background: `${statusColor}15`, border: `1px solid ${statusColor}40` }}
        >
          {statusLabel}
        </span>
      </div>

      {isStale && (
        <div className="stale-banner">
          <span className="stale-banner-icon">⚠</span>
          <span>Sequence data stale — do not use for spacing</span>
        </div>
      )}

      {/* Big position number */}
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-md)' }}>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
          Your Position
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6 }}>
          <span style={{
            fontFamily: 'var(--font-display)',
            fontSize: '3rem',
            fontWeight: 700,
            color: 'var(--color-primary)',
            textShadow: '0 0 30px rgba(0, 212, 255, 0.4)',
            lineHeight: 1,
          }}>
            #{sequence.sequenceNumber}
          </span>
          <span style={{ fontFamily: 'var(--font-data)', fontSize: '1rem', color: 'var(--text-muted)' }}>
            / {sequence.totalInSequence}
          </span>
        </div>
      </div>

      {/* Sequence visualizer */}
      <div className="sequence-track">
        {dots}
      </div>

      {/* Details */}
      <div style={{ marginTop: 'var(--space-md)' }}>
        <div className="data-row">
          <span className="data-label">Assigned Runway</span>
          <span className="data-value" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700 }}>
            {sequence.assignedRunway ?? '—'}
          </span>
        </div>
        <div className="data-row">
          <span className="data-label">Last Update</span>
          <span className="data-value muted" title={`${ageLabel(sequence.lastUpdatedUtc)}`}>
            {formatUtcTime(sequence.lastUpdatedUtc)}
          </span>
        </div>
        <div className="data-row">
          <span className="data-label">Status</span>
          <span className="data-value" style={{ color: statusColor }}>
            {sequence.status}
          </span>
        </div>
      </div>
    </div>
  );
}
