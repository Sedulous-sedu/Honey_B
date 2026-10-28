import { useState, useRef, useEffect, useCallback } from 'react';
import {
  evaluateContactPatch,
  duplicateTapShield,
  DEFAULT_TOUCH_SAFETY_CONFIG,
  type TouchSafetyConfig,
} from '../services/touchSafety';

export interface PressAndHoldButtonProps {
  actionId: string;
  onConfirmed: () => void;
  /** Label shown in quiescent state */
  label: string;
  /** Sub-label or advisory intent note */
  sublabel?: string;
  /** Consequential hold duration in ms (default 1000ms) */
  holdDurationMs?: number;
  /** Message ID or revision state to detect if message changed during hold */
  messageIntegrityKey?: string;
  config?: Partial<TouchSafetyConfig>;
  disabled?: boolean;
  className?: string;
  variant?: 'danger' | 'warning' | 'consequential' | 'accept';
  onTouchRejected?: (reason: 'GRAZE_TOO_SHORT' | 'OVERSIZED_PALM' | 'DUPLICATE_DEBOUNCE' | 'SLIPPED_OFF' | 'STATE_CHANGED' | 'INTERRUPTED') => void;
}

export function PressAndHoldButton({
  actionId,
  onConfirmed,
  label,
  sublabel,
  holdDurationMs = DEFAULT_TOUCH_SAFETY_CONFIG.consequentialHoldMs,
  messageIntegrityKey,
  config,
  disabled = false,
  className = '',
  variant = 'consequential',
  onTouchRejected,
}: PressAndHoldButtonProps) {
  const safetyConfig = { ...DEFAULT_TOUCH_SAFETY_CONFIG, ...config };
  const [isHolding, setIsHolding] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [cancelReason, setCancelReason] = useState<string | null>(null);

  const startTimeRef = useRef<number>(0);
  const startCoordinatesRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const animFrameRef = useRef<number | null>(null);
  const initialIntegrityKeyRef = useRef<string | undefined>(messageIntegrityKey);
  const isCompletedRef = useRef<boolean>(false);
  const cancelToastTimerRef = useRef<number | null>(null);

  const showCancelToast = useCallback((reason: string) => {
    setCancelReason(reason);
    if (cancelToastTimerRef.current) window.clearTimeout(cancelToastTimerRef.current);
    cancelToastTimerRef.current = window.setTimeout(() => setCancelReason(null), 1600);
  }, []);

  const resetHold = useCallback((reason?: string) => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setIsHolding(false);
    setProgressPercent(0);
    if (reason) {
      showCancelToast(reason);
    }
  }, [showCancelToast]);

  // Monitor message integrity key: if ground update alters message while pilot is holding, immediately cancel!
  useEffect(() => {
    if (isHolding && messageIntegrityKey !== initialIntegrityKeyRef.current) {
      resetHold('MESSAGE CHANGED DURING HOLD');
      onTouchRejected?.('STATE_CHANGED');
    }
  }, [messageIntegrityKey, isHolding, resetHold, onTouchRejected]);

  // Clean up animation frames
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (cancelToastTimerRef.current) clearTimeout(cancelToastTimerRef.current);
    };
  }, []);

  const runHoldAnimation = useCallback(function animate() {
    const elapsed = Date.now() - startTimeRef.current;
    const progress = Math.min(100, (elapsed / holdDurationMs) * 100);
    setProgressPercent(progress);

    if (progress >= 100) {
      // Completed full hold duration
      isCompletedRef.current = true;
      resetHold();

      // Check duplicate shield
      const tapCheck = duplicateTapShield.attemptAction(actionId, safetyConfig.debounceWindowMs);
      if (tapCheck.allowed) {
        onConfirmed();
      } else {
        showCancelToast('DUPLICATE BUFFERED');
        onTouchRejected?.('DUPLICATE_DEBOUNCE');
      }
      return;
    }

    animFrameRef.current = requestAnimationFrame(animate);
  }, [actionId, holdDurationMs, onConfirmed, onTouchRejected, resetHold, safetyConfig.debounceWindowMs, showCancelToast]);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;

    // 1. Palm / oversized touch rejection
    const patch = evaluateContactPatch(e, safetyConfig.maxContactDiameterPx);
    if (patch.isOversized) {
      showCancelToast('PALM CONTACT REJECTED');
      onTouchRejected?.('OVERSIZED_PALM');
      return;
    }

    startTimeRef.current = Date.now();
    startCoordinatesRef.current = { x: e.clientX, y: e.clientY };
    initialIntegrityKeyRef.current = messageIntegrityKey;
    isCompletedRef.current = false;
    setIsHolding(true);
    setProgressPercent(0);

    animFrameRef.current = requestAnimationFrame(runHoldAnimation);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isHolding || isCompletedRef.current) return;

    // 2. Cancel if finger slips away from initial contact
    const dx = e.clientX - startCoordinatesRef.current.x;
    const dy = e.clientY - startCoordinatesRef.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > safetyConfig.maxDisplacementPx) {
      resetHold('HOLD CANCELLED (SLIPPED)');
      onTouchRejected?.('SLIPPED_OFF');
    }
  };

  const handlePointerUp = () => {
    if (!isHolding || isCompletedRef.current) return;

    const dwell = Date.now() - startTimeRef.current;
    if (dwell < holdDurationMs) {
      resetHold('RELEASED EARLY — HOLD 1.0s TO CONFIRM');
      onTouchRejected?.('GRAZE_TOO_SHORT');
    }
  };

  const handlePointerLeave = () => {
    if (isHolding && !isCompletedRef.current) {
      resetHold('HOLD CANCELLED (FINGER SLIPPED)');
      onTouchRejected?.('SLIPPED_OFF');
    }
  };

  const handlePointerCancel = () => {
    if (isHolding && !isCompletedRef.current) {
      resetHold('TOUCH INTERRUPTED');
      onTouchRejected?.('INTERRUPTED');
    }
  };

  const remainingSeconds = Math.max(0, ((holdDurationMs - (progressPercent / 100) * holdDurationMs) / 1000)).toFixed(1);

  return (
    <div className={`press-hold-container variant-${variant} ${className}`}>
      <button
        type="button"
        disabled={disabled}
        className={`press-hold-button ${isHolding ? 'is-holding' : ''} ${disabled ? 'is-disabled' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerCancel}
        aria-label={`${label}. Press and hold for 1 second to confirm.`}
      >
        {/* Progress Background Fill Bar */}
        <div
          className="press-hold-progress-fill"
          style={{ width: `${progressPercent}%` }}
          aria-hidden="true"
        />

        {/* Button Content */}
        <div className="press-hold-content">
          <div className="press-hold-primary-row">
            <span className="press-hold-icon" aria-hidden="true">
              {isHolding ? '⏳' : '🔒'}
            </span>
            <span className="press-hold-label">
              {cancelReason ? cancelReason : isHolding ? `Holding... (${remainingSeconds}s)` : label}
            </span>
          </div>

          {sublabel && !cancelReason && !isHolding && (
            <div className="press-hold-sublabel">{sublabel}</div>
          )}

          {isHolding && (
            <div className="press-hold-instruction">
              Keep holding to confirm simulated clearance response
            </div>
          )}
        </div>

        {/* Circular Progress Gauge */}
        <div className="press-hold-gauge" aria-hidden="true">
          <svg width="34" height="34" viewBox="0 0 36 36">
            <path
              className="gauge-bg"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <path
              className="gauge-fill"
              strokeDasharray={`${progressPercent}, 100`}
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
          </svg>
        </div>
      </button>

      {/* Safety Cushion Buffer Tag */}
      <div className="safety-cushion-indicator" aria-hidden="true">
        <span>HOLD 1.0s SAFETY LOCK</span>
      </div>
    </div>
  );
}
