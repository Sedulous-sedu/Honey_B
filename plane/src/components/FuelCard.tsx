import type { AircraftFuelData } from '../types';
import { fmtKg } from '../utils/format';

interface Props {
  fuel?: AircraftFuelData;
  isStale?: boolean;
}

function fuelHealthClass(pct: number): string {
  if (pct > 60) return 'healthy';
  if (pct > 35) return 'caution';
  return 'low';
}

export function FuelCard({ fuel, isStale }: Props) {
  const isUnavailable = !fuel || fuel.unavailableReason || fuel.fuelOnBoardKg === undefined;

  const fob = fuel?.fuelOnBoardKg;
  const reserve = fuel?.finalReserveFuelKg ?? 0;
  const alt = fuel?.alternatesFuelKg ?? 0;
  const minRequired = reserve + alt;
  const usableAboveReserve = fob !== undefined ? fob - minRequired : undefined;
  const etaFuel = fuel?.estimatedFuelAtArrivalKg;
  const etaAboveReserve = etaFuel !== undefined ? etaFuel - minRequired : undefined;

  const fobPct = fob !== undefined && usableAboveReserve !== undefined && fob > 0
    ? Math.max(0, Math.min(100, (usableAboveReserve / fob) * 100))
    : 0;

  return (
    <div className={`card ${isStale ? 'stale' : ''}`} id="fuel-delay-panel">
      {/* Header */}
      <div className="card-header">
        <div className="card-title">
          <span className="card-title-icon">⛽</span>
          <span>Fuel &amp; Delay Impact</span>
        </div>
        <div className="source-tag source-aircraft">
          <span className="source-dot" />
          <span>SOURCE: AIRCRAFT FUEL SENSORS (FMS / FQIS)</span>
        </div>
      </div>

      <div className="card-subhead">
        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
          Decision Support · Real-time FMS Fuel Computation
        </span>
        {fuel?.holdingEnduranceMinutes !== undefined && !isUnavailable && (
          <span className="holding-endurance-badge" style={{
            color: fuel.holdingEnduranceMinutes < 30 ? 'var(--color-critical)' : 'var(--color-live)',
            background: fuel.holdingEnduranceMinutes < 30 ? 'var(--color-critical-bg)' : 'rgba(34,197,94,0.1)',
            border: `1px solid ${fuel.holdingEnduranceMinutes < 30 ? 'var(--color-critical-border)' : 'rgba(34,197,94,0.3)'}`,
          }}>
            Hold Endurance: {fuel.holdingEnduranceMinutes} min
          </span>
        )}
      </div>

      {isStale && (
        <div className="stale-banner">
          <span className="stale-banner-icon">⚠</span>
          <span>Fuel calculations based on last known data — re-verify with totalizer</span>
        </div>
      )}

      {/* When data is missing, display explicit "unavailable" state without guessing */}
      {isUnavailable ? (
        <div className="fuel-unavailable-box">
          <div className="unavailable-icon">⚠</div>
          <div className="unavailable-title">FUEL DATA UNAVAILABLE</div>
          <div className="unavailable-desc">
            {fuel?.unavailableReason ?? 'Aircraft fuel quantity / flow rate sensors disconnected. Fuel delay impact cannot be estimated.'}
          </div>
          <div className="unavailable-guidance">
            Standard Operating Procedure: Revert to onboard manual fuel log and FMS totalizer page.
          </div>
        </div>
      ) : (
        <>
          {/* Primary Fuel Metrics Grid */}
          <div className="data-grid fuel-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginBottom: 'var(--space-md)' }}>
            <div className="metric-tile">
              <span className="metric-tile-label">Fuel on Board (FOB)</span>
              <span className="metric-tile-value highlight-cyan" style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem' }}>
                {fmtKg(fob)}
              </span>
            </div>

            <div className="metric-tile">
              <span className="metric-tile-label">Fuel Burn Rate</span>
              <span className="metric-tile-value" style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem' }}>
                {fmtKg(fuel.fuelFlowKgPerHr)}<span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>/hr</span>
              </span>
            </div>

            <div className="metric-tile">
              <span className="metric-tile-label">Alternate Fuel</span>
              <span className="metric-tile-value">{fmtKg(fuel.alternatesFuelKg)}</span>
            </div>

            <div className="metric-tile">
              <span className="metric-tile-label">Final Reserve Fuel</span>
              <span className="metric-tile-value">{fmtKg(fuel.finalReserveFuelKg)}</span>
            </div>
          </div>

          {/* Touchdown Fuel Prediction with Delay factored in */}
          {etaFuel !== undefined && (
            <div className="eta-fuel-block" style={{ marginBottom: 'var(--space-sm)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <span className="data-label">Estimated Fuel at Touchdown (Delayed)</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.4rem',
                    fontWeight: 700,
                    color: fobPct > 35 ? 'var(--color-live)' : 'var(--color-high)',
                  }}>
                    {fmtKg(etaFuel)}
                  </span>
                  {etaAboveReserve !== undefined && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      (+{fmtKg(etaAboveReserve)} above reserve)
                    </span>
                  )}
                </div>
              </div>

              {/* Graphical Fuel Reserves Bar */}
              <div className="fuel-bar-container">
                <div className="fuel-bar-track">
                  <div
                    className={`fuel-bar-fill ${fuelHealthClass(fobPct)}`}
                    style={{ width: `${fobPct}%` }}
                  />
                </div>
                <div className="fuel-bar-markers">
                  <span style={{ color: 'var(--color-critical)' }}>Reserve ({fmtKg(reserve)})</span>
                  <span style={{ color: 'var(--color-high)' }}>Caution</span>
                  <span style={{ color: 'var(--color-live)' }}>Normal FOB</span>
                </div>
              </div>
            </div>
          )}

          {/* Assumptions Callout */}
          {fuel.fuelTrendAssumptions && (
            <div className="fuel-assumptions-box">
              <strong>Delay Impact Model:</strong> {fuel.fuelTrendAssumptions}
            </div>
          )}
        </>
      )}
    </div>
  );
}
