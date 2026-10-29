import type {
  GroundLandingSequence,
  GroundHoldingData,
  AircraftData,
} from '../types';
import {
  formatUtcTime,
  ageLabel,
  etaDeltaMin,
  formatDeltaMin,
} from '../utils/format';

interface Props {
  sequence: GroundLandingSequence;
  holding: GroundHoldingData;
  aircraft: AircraftData;
  isStale?: boolean;
}

export function ArrivalOverviewCard({ sequence, holding, aircraft, isStale }: Props) {
  // Sequence dots visualizer
  const dots = [];
  for (let i = 1; i <= sequence.totalInSequence; i++) {
    let cls = 'sequence-dot';
    if (i < sequence.sequenceNumber) cls += ' landed';
    else if (i === sequence.sequenceNumber) cls += ' mine';
    else cls += ' ahead';
    dots.push(
      <div key={i} className={cls} title={`Position ${i} of ${sequence.totalInSequence}`}>
        {i === sequence.sequenceNumber ? i : ''}
      </div>
    );
  }

  // ETA deltas between Ground Target Landing Time and Aircraft FMS ETA
  const groundEta = sequence.targetLandingTimeUtc;
  const fmsEta = aircraft.fmsEtaUtc;
  const previousGroundEta = sequence.previousTargetLandingTimeUtc;

  const fmsVsGroundDelta = etaDeltaMin(groundEta, fmsEta);
  const groundPreviousDelta = etaDeltaMin(groundEta, previousGroundEta);

  const seqStatusColor =
    sequence.status === 'CONFIRMED' ? 'var(--color-live)' : 'var(--color-medium)';

  return (
    <div className={`card ${isStale ? 'stale' : ''}`} id="arrival-overview-panel">
      {/* Header */}
      <div className="card-header">
        <div className="card-title">
          <span className="card-title-icon">🛬</span>
          <span>Arrival &amp; Sequencing Overview</span>
        </div>
        <div className="source-tag source-ground">
          <span className="source-dot" />
          <span>SOURCE: GROUND CONTROL (AMAN / ATC)</span>
        </div>
      </div>

      <div className="card-subhead">
        <span
          className="card-badge"
          style={{
            color: seqStatusColor,
            background: `${seqStatusColor}15`,
            border: `1px solid ${seqStatusColor}40`,
          }}
        >
          {sequence.status === 'CONFIRMED' ? '✓ SEQUENCE CONFIRMED' : '~ SEQUENCE ESTIMATED'}
        </span>
        <span className="card-updated-time">
          Updated {formatUtcTime(sequence.lastUpdatedUtc)} ({ageLabel(sequence.lastUpdatedUtc)})
        </span>
      </div>

      {isStale && (
        <div className="stale-banner">
          <span className="stale-banner-icon">⚠</span>
          <span>Arrival sequencing data stale — confirm spacing on VHF voice</span>
        </div>
      )}

      {/* 3-Column Summary: Sequence #, Assigned Runway, Target Landing Time */}
      <div className="data-grid overview-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 'var(--space-md)' }}>
        <div className="metric-tile" style={{ textAlign: 'center' }}>
          <span className="metric-tile-label">Landing Sequence</span>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4 }}>
            <span style={{
              fontFamily: 'var(--font-display)',
              fontSize: '2.5rem',
              fontWeight: 700,
              color: 'var(--color-primary)',
              lineHeight: 1,
            }}>
              #{sequence.sequenceNumber}
            </span>
            <span style={{ fontFamily: 'var(--font-data)', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              /{sequence.totalInSequence}
            </span>
          </div>
          <span className="metric-tile-sub">{sequence.status}</span>
        </div>

        <div className="metric-tile" style={{ textAlign: 'center' }}>
          <span className="metric-tile-label">Assigned Runway</span>
          <span style={{
            fontFamily: 'var(--font-display)',
            fontSize: '2.2rem',
            fontWeight: 700,
            color: sequence.assignedRunway ? 'var(--color-primary)' : 'var(--text-muted)',
            lineHeight: 1,
          }}>
            {sequence.assignedRunway ?? 'PENDING'}
          </span>
          <span className="metric-tile-sub">
            {sequence.assignedRunway ? 'Tower Assigned' : 'Awaiting Final Assign'}
          </span>
        </div>

        <div className="metric-tile" style={{ textAlign: 'center' }}>
          <span className="metric-tile-label">Target Landing Time</span>
          <span style={{
            fontFamily: 'var(--font-data)',
            fontSize: '1.4rem',
            fontWeight: 700,
            color: 'var(--color-live)',
            lineHeight: 1.2,
          }}>
            {formatUtcTime(sequence.targetLandingTimeUtc)}
          </span>
          <span className="metric-tile-sub" style={{ color: sequence.delayMinutes > 5 ? 'var(--color-high)' : 'var(--text-muted)' }}>
            Delay: +{sequence.delayMinutes} min
          </span>
        </div>
      </div>

      {/* Sequence visual queue track */}
      <div style={{ marginBottom: 'var(--space-md)' }}>
        <div className="data-label" style={{ marginBottom: 6 }}>Arrival Queue Position</div>
        <div className="sequence-track">
          {dots}
        </div>
      </div>

      {/* ETA Comparison & Delta Section */}
      <div className="eta-comparison-box" style={{ marginBottom: 'var(--space-md)' }}>
        <div className="eta-comp-row">
          <div>
            <span className="data-label">Aircraft FMS Autonomous ETA:</span>
            <span className="eta-comp-val">{formatUtcTime(fmsEta)}</span>
          </div>
          <div>
            <span className="data-label">Ground AMAN Target Landing Time:</span>
            <span className="eta-comp-val highlight-green">{formatUtcTime(groundEta)}</span>
          </div>
          <div>
            <span className="data-label">AMAN vs FMS Delta:</span>
            <span className={`eta-delta ${fmsVsGroundDelta && fmsVsGroundDelta > 0 ? 'positive' : 'neutral'}`}>
              {formatDeltaMin(fmsVsGroundDelta)}
            </span>
          </div>
        </div>

        {sequence.previousTargetLandingTimeUtc && (
          <div className="eta-comp-sub">
            <span>Previous AMAN Target: {formatUtcTime(sequence.previousTargetLandingTimeUtc)}</span>
            <span>Revision Shift: {formatDeltaMin(groundPreviousDelta)}</span>
            {sequence.delayReasonText && (
              <span className="eta-reason-text">Reason: {sequence.delayReasonText}</span>
            )}
          </div>
        )}
      </div>

      {/* Holding Section — CLEAR SEPARATION OF INSTRUCTION VS PREDICTION */}
      <div className="holding-integration-block">
        {!holding.active ? (
          <div className="holding-inactive-banner">
            <span className="holding-check">✓</span>
            <span>No airborne hold assigned · Standard descent &amp; STAR active</span>
          </div>
        ) : (
          <div className="holding-active-container">
            <div className="holding-header-strip">
              <span className="holding-warning-icon">⟳</span>
              <strong>ACTIVE HOLDING ASSIGNED BY ATC</strong>
              <span className="phase-badge holding" style={{ marginLeft: 'auto' }}>HOLDING</span>
            </div>

            {/* Part A: ATC Instruction / Clearance */}
            <div className="holding-instruction-box">
              <div className="holding-box-tag atc-tag">ATC INSTRUCTION / CLEARANCE (OPERATIVE)</div>
              <div className="holding-details-grid">
                <div>
                  <span className="data-label">Holding Fix:</span>
                  <span className="holding-strong-val">{holding.fix ?? '—'}</span>
                </div>
                <div>
                  <span className="data-label">Inbound Track:</span>
                  <span className="holding-strong-val">{holding.inboundTrackDeg ? `${holding.inboundTrackDeg}°` : '—'}</span>
                </div>
                <div>
                  <span className="data-label">Turns / Legs:</span>
                  <span className="holding-strong-val">{holding.turnDirection ?? 'RIGHT'}, {holding.legDurationMin ?? 1} min</span>
                </div>
                <div>
                  <span className="data-label">Assigned Altitude:</span>
                  <span className="holding-strong-val">{holding.assignedAltitudeFt ? `FL${holding.assignedAltitudeFt / 100}` : '—'}</span>
                </div>
              </div>

              {holding.efcUtc && (
                <div className="efc-callout">
                  <div>
                    <div className="efc-title">EXPECT FURTHER CLEARANCE (EFC) TIME:</div>
                    <div className="efc-time">{formatUtcTime(holding.efcUtc)}</div>
                  </div>
                  <div className="efc-note">
                    ATC-ISSUED CLEARANCE · Operative time for radio failure procedures
                  </div>
                </div>
              )}
            </div>

            {/* Part B: Ground AMAN Predicted Delay (DECISION-SUPPORT ONLY) */}
            {holding.predictedDelayMinutes !== undefined && (
              <div className="holding-prediction-box">
                <div className="holding-box-tag prediction-tag">
                  ⚠ DECISION SUPPORT ESTIMATE — NOT AN ATC CLEARANCE
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
                  <span className="predicted-delay-num">
                    ~{holding.predictedDelayMinutes}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    min estimated delay in stack
                  </span>
                </div>
                <div className="prediction-disclaimer-text">
                  {holding.predictionReason ?? 'Ground AMAN simulation estimate based on arrival flow rate.'}
                  <br />
                  <strong>Important:</strong> Predicted holding time is NOT a clearance to depart the hold or alter routing.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
