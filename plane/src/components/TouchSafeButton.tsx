import { useState, useRef } from 'react';
import {
  evaluateContactPatch,
  duplicateTapShield,
  DEFAULT_TOUCH_SAFETY_CONFIG,
  type TouchSafetyConfig,
} from '../services/touchSafety';

export interface TouchSafeButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  actionId: string;
  onDeliberateClick: () => void;
  config?: Partial<TouchSafetyConfig>;
  /** Optional variant: 'primary' | 'secondary' | 'unable' | 'ack' | 'ghost' */
  variant?: 'primary' | 'secondary' | 'unable' | 'ack' | 'ghost';
  /** Feedback callback for telemetry / test inspection */
  onTouchRejected?: (reason: 'GRAZE_TOO_SHORT' | 'OVERSIZED_PALM' | 'DUPLICATE_DEBOUNCE' | 'SLIPPED_OFF') => void;
  children: React.ReactNode;
}

export function TouchSafeButton({
  actionId,
  onDeliberateClick,
  config,
  variant = 'primary',
  onTouchRejected,
  children,
  className = '',
  disabled,
  style,
  ...rest
}: TouchSafeButtonProps) {
  const safetyConfig = { ...DEFAULT_TOUCH_SAFETY_CONFIG, ...config };
  const [isPressing, setIsPressing] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [rejectWarning, setRejectWarning] = useState<string | null>(null);

  const pointerStartTimeRef = useRef<number>(0);
  const startCoordinatesRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isCancelledRef = useRef<boolean>(false);
  const warningTimerRef = useRef<number | null>(null);

  const showWarning = (msg: string) => {
    setRejectWarning(msg);
    if (warningTimerRef.current) window.clearTimeout(warningTimerRef.current);
    warningTimerRef.current = window.setTimeout(() => setRejectWarning(null), 1400);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;

    // 1. Check for oversized palm contact if device provides geometry
    const patch = evaluateContactPatch(e, safetyConfig.maxContactDiameterPx);
    if (patch.isOversized) {
      isCancelledRef.current = true;
      setIsPressing(false);
      showWarning('PALM/GRAZE REJECTED');
      onTouchRejected?.('OVERSIZED_PALM');
      return;
    }

    pointerStartTimeRef.current = Date.now();
    startCoordinatesRef.current = { x: e.clientX, y: e.clientY };
    isCancelledRef.current = false;
    setIsPressing(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isPressing || isCancelledRef.current) return;

    // 2. Check pointer displacement (slipping off)
    const dx = e.clientX - startCoordinatesRef.current.x;
    const dy = e.clientY - startCoordinatesRef.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > safetyConfig.maxDisplacementPx) {
      isCancelledRef.current = true;
      setIsPressing(false);
      showWarning('TOUCH SLIPPED');
      onTouchRejected?.('SLIPPED_OFF');
    }
  };

  const handlePointerUp = () => {
    if (disabled || isCancelledRef.current || !isPressing) {
      setIsPressing(false);
      return;
    }

    setIsPressing(false);
    const dwell = Date.now() - pointerStartTimeRef.current;

    // 3. Reject accidental short graze (< minDwellMs)
    if (dwell < safetyConfig.minDwellMs) {
      showWarning('GRAZE TOO SHORT');
      onTouchRejected?.('GRAZE_TOO_SHORT');
      return;
    }

    // 4. Check duplicate tap within debounce window
    const tapCheck = duplicateTapShield.attemptAction(actionId, safetyConfig.debounceWindowMs);
    if (!tapCheck.allowed) {
      setDuplicateWarning(true);
      window.setTimeout(() => setDuplicateWarning(false), 900);
      onTouchRejected?.('DUPLICATE_DEBOUNCE');
      return;
    }

    // 5. Valid deliberate activation
    onDeliberateClick();
  };

  const handlePointerCancel = () => {
    isCancelledRef.current = true;
    setIsPressing(false);
  };

  const handlePointerLeave = () => {
    if (isPressing) {
      isCancelledRef.current = true;
      setIsPressing(false);
      showWarning('TOUCH SLIPPED OUT');
      onTouchRejected?.('SLIPPED_OFF');
    }
  };

  return (
    <button
      {...rest}
      disabled={disabled}
      className={`touch-safe-btn variant-${variant} ${isPressing ? 'is-pressing' : ''} ${duplicateWarning ? 'is-duplicate-buffered' : ''} ${className}`}
      style={style}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerLeave}
    >
      <div className="touch-safe-btn-content">
        {rejectWarning ? (
          <span className="touch-safety-alert-label">{rejectWarning}</span>
        ) : duplicateWarning ? (
          <span className="touch-safety-alert-label">DUPLICATE BUFFERED</span>
        ) : (
          children
        )}
      </div>

      {/* Immediate tactile/visual depression ring */}
      <span className="touch-safe-feedback-ring" aria-hidden="true" />
    </button>
  );
}
