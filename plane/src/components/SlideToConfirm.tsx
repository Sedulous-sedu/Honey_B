import { useState, useRef, useEffect, useCallback } from 'react';
import {
  evaluateContactPatch,
  duplicateTapShield,
  DEFAULT_TOUCH_SAFETY_CONFIG,
} from '../services/touchSafety';

export interface SlideToConfirmProps {
  actionId: string;
  onConfirmed: () => void;
  /** Label displayed along the track */
  label?: string;
  /** Optional icon or text on handle */
  handleLabel?: string;
  disabled?: boolean;
  /** Visual color theme: 'emerald' | 'amber' | 'cyan' | 'purple' */
  variant?: 'emerald' | 'amber' | 'cyan' | 'purple';
  /** Time in ms before reset after successful slide (0 to stay confirmed) */
  resetAfterConfirmMs?: number;
  className?: string;
}

export function SlideToConfirm({
  actionId,
  onConfirmed,
  label = 'SLIDE TO CONFIRM',
  handleLabel = '✈',
  disabled = false,
  variant = 'cyan',
  resetAfterConfirmMs = 2500,
  className = '',
}: SlideToConfirmProps) {
  const [dragProgress, setDragProgress] = useState(0); // 0 to 1
  const [isDragging, setIsDragging] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [rejectWarning, setRejectWarning] = useState<string | null>(null);
  const [trackMetrics, setTrackMetrics] = useState({ trackWidth: 260, handleWidth: 50 });

  const trackRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef<number>(0);
  const resetTimerRef = useRef<number | null>(null);

  const CONFIRM_THRESHOLD = 0.85;

  const showReject = useCallback((msg: string) => {
    setRejectWarning(msg);
    window.setTimeout(() => setRejectWarning(null), 1400);
  }, []);

  useEffect(() => {
    const updateMetrics = () => {
      if (trackRef.current && handleRef.current) {
        setTrackMetrics({
          trackWidth: trackRef.current.clientWidth,
          handleWidth: handleRef.current.clientWidth,
        });
      }
    };
    updateMetrics();
    window.addEventListener('resize', updateMetrics);
    return () => {
      window.removeEventListener('resize', updateMetrics);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || isConfirmed) return;

    // Palm / oversized rejection
    const patch = evaluateContactPatch(e);
    if (patch.isOversized) {
      showReject('PALM REJECTED');
      return;
    }

    const maxSlide = Math.max(1, trackMetrics.trackWidth - trackMetrics.handleWidth);
    startXRef.current = e.clientX - (dragProgress * maxSlide);
    setIsDragging(true);

    // Capture pointer to track smoothly outside handle boundary
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || disabled || isConfirmed) return;

    const maxSlide = Math.max(1, trackMetrics.trackWidth - trackMetrics.handleWidth);
    const currentX = e.clientX - startXRef.current;
    const clampedProgress = Math.max(0, Math.min(1, currentX / maxSlide));
    setDragProgress(clampedProgress);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || disabled || isConfirmed) {
      setIsDragging(false);
      return;
    }

    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignored if not captured
    }

    setIsDragging(false);

    if (dragProgress >= CONFIRM_THRESHOLD) {
      // Passed threshold -> Confirm
      setDragProgress(1);
      setIsConfirmed(true);

      const check = duplicateTapShield.attemptAction(actionId, DEFAULT_TOUCH_SAFETY_CONFIG.debounceWindowMs);
      if (check.allowed) {
        onConfirmed();
      }

      if (resetAfterConfirmMs > 0) {
        resetTimerRef.current = window.setTimeout(() => {
          setIsConfirmed(false);
          setDragProgress(0);
        }, resetAfterConfirmMs);
      }
    } else {
      // Spring back to start
      setDragProgress(0);
    }
  };

  const maxSlidePx = Math.max(0, trackMetrics.trackWidth - trackMetrics.handleWidth);
  const currentTranslateX = dragProgress * maxSlidePx;

  return (
    <div
      ref={trackRef}
      className={`slide-to-confirm-track variant-${variant} ${isDragging ? 'is-dragging' : ''} ${isConfirmed ? 'is-confirmed' : ''} ${disabled ? 'is-disabled' : ''} ${className}`}
      role="slider"
      aria-label={label}
      aria-valuenow={Math.round(dragProgress * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (disabled || isConfirmed) return;
        if (e.key === 'ArrowRight') {
          const next = Math.min(1, dragProgress + 0.2);
          setDragProgress(next);
          if (next >= CONFIRM_THRESHOLD) {
            setIsConfirmed(true);
            onConfirmed();
          }
        }
      }}
    >
      {/* Background Track Fill */}
      <div
        className="slide-track-fill"
        style={{
          width: `${Math.max(trackMetrics.handleWidth, currentTranslateX + trackMetrics.handleWidth)}px`,
        }}
        aria-hidden="true"
      />

      {/* Track Label */}
      <div className="slide-track-label" aria-hidden="true">
        {rejectWarning ? (
          <span className="slide-reject-text">{rejectWarning}</span>
        ) : isConfirmed ? (
          <span className="slide-confirmed-text">✓ CONFIRMED</span>
        ) : (
          <>
            <span>{label}</span>
            <span className="slide-chevrons">›››</span>
          </>
        )}
      </div>

      {/* Draggable Handle */}
      <div
        ref={handleRef}
        className="slide-handle"
        style={{
          transform: `translateX(${currentTranslateX}px)`,
          transition: isDragging ? 'none' : 'transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1)',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          setIsDragging(false);
          setDragProgress(0);
        }}
      >
        <span className="slide-handle-icon">{isConfirmed ? '✓' : handleLabel}</span>
      </div>
    </div>
  );
}
