import { useState } from 'react';
import { TouchSafeButton } from './TouchSafeButton';
import { PressAndHoldButton } from './PressAndHoldButton';
import { SlideToConfirm } from './SlideToConfirm';

interface TestLog {
  id: string;
  time: string;
  type: string;
  result: 'SUCCESS' | 'REJECTED' | 'CANCELLED';
  detail: string;
}

export function TouchSafetyShowcase({ onClose }: { onClose?: () => void }) {
  const [logs, setLogs] = useState<TestLog[]>([]);
  const [simulatedRevision, setSimulatedRevision] = useState(1);
  const [lastConfirmedAction, setLastConfirmedAction] = useState<string | null>(null);

  const addLog = (type: string, result: 'SUCCESS' | 'REJECTED' | 'CANCELLED', detail: string) => {
    const newLog: TestLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      time: new Date().toISOString().substring(11, 19),
      type,
      result,
      detail,
    };
    setLogs((prev) => [newLog, ...prev.slice(0, 14)]);
  };

  return (
    <div className="touch-safety-test-deck" role="region" aria-label="Cockpit Touch Safety Verification Suite">
      <div className="test-deck-header">
        <div className="test-deck-title">
          <span className="test-deck-badge">TOUCH-SAFETY SUITE</span>
          <h3>Aviation Cockpit Touch Protection &amp; Ergonomics Verification</h3>
        </div>
        {onClose && (
          <button className="test-deck-close-btn" onClick={onClose} aria-label="Close test deck">✕</button>
        )}
      </div>

      <div className="test-deck-disclaimer">
        <span>ℹ</span>
        <div>
          <strong>Device-Dependent vs. Universal Protections:</strong><br />
          - <em>Universal (all screens):</em> 1.0s Press-and-Hold progress, slip-off cancellation (&gt;14px), minimum dwell rejection (&lt;120ms graze), rapid duplicate suppression (450ms window), message-change cancellation.<br />
          - <em>Device-Dependent (Touch/Stylus only):</em> Palm / oversized contact patch rejection requires hardware/OS support for <code>PointerEvent.width/height</code> or <code>Touch.radiusX/radiusY</code> (supported on iPadOS, modern Android tablets, and Windows Pen). On mouse/emulators, contact geometry defaults to 1px and passes safely.
        </div>
      </div>

      <div className="test-deck-grid">
        {/* Test Zone 1: Ordinary Deliberate Press Button */}
        <div className="test-card">
          <h4>1. Ordinary Response: Deliberate Press (Dwell &gt; 120ms)</h4>
          <p className="test-card-desc">
            A quick brush or graze (&lt;120ms) is discarded. Duplicate taps within 450ms are suppressed.
          </p>
          <div className="test-controls-row">
            <TouchSafeButton
              actionId="test-ack-button"
              variant="ack"
              onDeliberateClick={() => {
                setLastConfirmedAction('Deliberate Press Acknowledged');
                addLog('Deliberate Press', 'SUCCESS', 'Acknowledged receipt (Dwell > 120ms, debounced)');
              }}
              onTouchRejected={(reason) => {
                addLog('Deliberate Press', 'REJECTED', `Touch rejected: ${reason}`);
              }}
            >
              ✓ Test Acknowledge (Short Deliberate Press)
            </TouchSafeButton>
          </div>
        </div>

        {/* Test Zone 2: Consequential Press & Hold (1.0s) */}
        <div className="test-card">
          <h4>2. Consequential Response: 1.0s Press-and-Hold</h4>
          <p className="test-card-desc">
            Used for simulated clearances. Requires full 1.0s continuous press with visible circular/linear progress. Slipped finger, early release, or message state change cancels the hold immediately.
          </p>
          <div className="test-controls-row">
            <PressAndHoldButton
              actionId="test-consequential-hold"
              variant="accept"
              label="Accept Tactical Reroute (Advisory)"
              sublabel="Hold 1.0s to confirm transmission"
              messageIntegrityKey={`rev-${simulatedRevision}`}
              onConfirmed={() => {
                setLastConfirmedAction('Consequential 1.0s Hold Confirmed');
                addLog('1.0s Hold', 'SUCCESS', 'Confirmed simulated reroute advisory acceptance');
              }}
              onTouchRejected={(reason) => {
                addLog('1.0s Hold', 'CANCELLED', `Hold cancelled: ${reason}`);
              }}
            />

            <button
              type="button"
              className="test-mutate-btn"
              onClick={() => {
                setSimulatedRevision((r) => r + 1);
                addLog('Simulated State', 'CANCELLED', `Message revision bumped to #${simulatedRevision + 1} (tests mid-hold cancellation)`);
              }}
              title="Simulates ground control updating the message or proposal during a pilot hold"
            >
              ⚡ Simulate Ground Message Change (Rev #{simulatedRevision})
            </button>
          </div>
        </div>

        {/* Test Zone 3: Reusable Slide-to-Confirm */}
        <div className="test-card">
          <h4>3. Reusable Slide-to-Confirm (Future Runway / Takeoff Flows)</h4>
          <p className="test-card-desc">
            Requires continuous drag past 85% track threshold. Springs back if released early. Rejects palm rests.
          </p>
          <div className="test-controls-row">
            <SlideToConfirm
              actionId="test-slide-confirm"
              label="SLIDE TO CONFIRM RUNWAY ADVISORY"
              variant="cyan"
              onConfirmed={() => {
                setLastConfirmedAction('Slide-to-Confirm Triggered');
                addLog('Slide-to-Confirm', 'SUCCESS', 'Slider completed past 85% threshold');
              }}
            />
          </div>
        </div>
      </div>

      {/* Real-Time Test Verification Telemetry Log */}
      <div className="test-telemetry-zone">
        <div className="telemetry-header">
          <strong>Interactive Test Telemetry &amp; Rejection Audit Log</strong>
          {lastConfirmedAction && (
            <span className="last-confirmed-badge">Last Action: {lastConfirmedAction}</span>
          )}
          <button className="clear-log-btn" onClick={() => setLogs([])}>Clear Log</button>
        </div>

        <div className="telemetry-log-table">
          {logs.length === 0 ? (
            <div className="telemetry-empty">
              No touch events recorded yet. Tap briefly (&lt;120ms) to test graze rejection, tap twice quickly to test duplicate debounce, or hold and drag off the button to test slip cancellation.
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className={`telemetry-row result-${log.result.toLowerCase()}`}>
                <span className="log-time">{log.time}</span>
                <span className="log-type">{log.type}</span>
                <span className={`log-badge badge-${log.result.toLowerCase()}`}>{log.result}</span>
                <span className="log-detail">{log.detail}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
