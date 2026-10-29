import type { FuelData } from '../types';
import { fmtKg } from '../utils/format';

interface Props {
  fuel: FuelData;
  isStale?: boolean;
}

function fuelHealthClass(pct: number): string {
  if (pct > 60) return 'healthy';
  if (pct > 35) return 'caution';
  return 'low';
}

export function FuelCard({ fuel, isStale }: Props) {
  // Calculate available fuel above reserves
  const fob = fuel.fuelOnBoardKg;
  const reserve = fuel.finalReserveFuelKg ?? 0;
  const alt = fuel.alternatesFuelKg ?? 0;
  const minRequired = reserve + alt;
  const usableFuel = fob !== undefined ? fob - minRequired : undefined;
  const eta = fuel.estimatedFuelAtArrivalKg;
  const etaAboveReserve = eta !== undefined ? eta - minRequired : undefined;

  // Percent usable above reserve
  const fobPct = fob !== undefined && usableFuel !== undefined && fob > 0
    ? Math.max(0, Math.min(100, (usableFuel / fob) * 100))
    : 0;

  const isUnavailable = fuel.unavailableReason || (fob === undefined);

  return (
    <div className={`card ${isStale ? 'stale' : ''}`}>
      <div className="card-header">
        <div className="card-title">
          <span className="card-title-icon">⛽</span>
          Fuel &amp; Delay Impact
        </div>
        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
          Decision support only
        </span>
      </div>

      {isStale && (
        <div className="stale-banner">
          <span className="stale-banner-icon">⚠</span>
          <span>Fuel values are from last known data — may not reflect current state</span>
        </div>
      )}

      {isUnavailable ? (
        <div style={{
          textAlign: 'center',
          padding: 'var(--space-xl)',
          color: 'var(--text-muted)',
          fontSize: '0.82rem',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>—</div>
          <div>Fuel data unavailable</div>
          {fuel.unavailableReason && (
            <div style={{ fontSize: '0.72rem', marginTop: 4, color: 'var(--text-muted)' }}>
              {fuel.unavailableReason}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Primary values */}
          <div className="data-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginBottom: 'var(--space-md)' }}>
            <div className="metric-tile">
              <span className="metric-tile-label">Fuel on Board</span>
              <span className="metric-tile-value" style={{ color: 'var(--color-primary)' }}>
                {fmtKg(fob)}
              </span>
            </div>
            <div className="metric-tile">
              <span className="metric-tile-label">Flow Rate</span>
              <span className="metric-tile-value">{fmtKg(fuel.fuelFlowKgPerHr)}<span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>/hr</span></span>
            </div>
            <div className="metric-tile">
              <span className="metric-tile-label">Alternates Fuel</span>
              <span className="metric-tile-value">{fmtKg(fuel.alternatesFuelKg)}</span>
            </div>
            <div className="metric-tile">
              <span className="metric-tile-label">Final Reserve</span>
              <span className="metric-tile-value">{fmtKg(fuel.finalReserveFuelKg)}</span>
            </div>
          </div>

          {/* Estimated at arrival */}
          {eta !== undefined && (
            <>
              <div style={{ marginBottom: 'var(--space-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <div className="data-label">Est. Fuel at Arrival</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '1.3rem',
                      fontWeight: 700,
                      color: fobPct > 35 ? 'var(--color-live)' : 'var(--color-high)',
                    }}>
                      {fmtKg(eta)}
                    </span>
                    {etaAboveReserve !== undefined && (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        (+{fmtKg(etaAboveReserve)} above reserve)
                      </span>
                    )}
                  </div>
                </div>

                {/* Visual fuel bar */}
                <div className="fuel-bar-container">
                  <div className="fuel-bar-track">
                    <div
                      className={`fuel-bar-fill ${fuelHealthClass(fobPct)}`}
                      style={{ width: `${fobPct}%` }}
                    />
                  </div>
                  <div className="fuel-bar-markers">
                    <span>Reserve</span>
                    <span>Caution</span>
                    <span>Normal</span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Assumptions */}
          {fuel.fuelTrendAssumptions && (
            <div className="fuel-assumptions">
              <strong style={{ color: 'var(--text-secondary)', fontStyle: 'normal' }}>Assumptions:</strong>{' '}
              {fuel.fuelTrendAssumptions}
            </div>
          )}
        </>
      )}
    </div>
  );
}
