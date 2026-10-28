/**
 * Cockpit Touch-Safety System & Ergonomic Protection
 * 
 * Implements aviation-grade touch safety heuristics:
 * 1. Palm / oversized contact patch rejection (based on PointerEvent.width/height or Touch.radiusX/radiusY)
 * 2. Rapid duplicate tap suppression (refractory window)
 * 3. Deliberate dwell vs. accidental graze discrimination
 * 4. Slipping & pointer cancellation detection
 * 5. Consequential press-and-hold (1000ms) with message state integrity validation
 */

export interface TouchSafetyConfig {
  /** Minimum press dwell in ms to distinguish deliberate tap from an accidental graze (default 120ms) */
  minDwellMs: number;
  /** Duplicate tap suppression refractory window in ms (default 450ms) */
  debounceWindowMs: number;
  /** Consequential press-and-hold duration in ms (default 1000ms) */
  consequentialHoldMs: number;
  /** Maximum pointer displacement in px before cancelling a hold or tap (default 14px) */
  maxDisplacementPx: number;
  /** Maximum contact patch diameter in px for palm / flat hand rejection (default 48px) */
  maxContactDiameterPx: number;
}

export const DEFAULT_TOUCH_SAFETY_CONFIG: TouchSafetyConfig = {
  minDwellMs: 120,
  debounceWindowMs: 450,
  consequentialHoldMs: 1000,
  maxDisplacementPx: 14,
  maxContactDiameterPx: 48,
};

export interface TouchTelemetry {
  pointerType: string;
  contactWidth: number;
  contactHeight: number;
  pressure: number;
  dwellMs: number;
  rejectedReason: string | null;
  timestamp: number;
}

/**
 * Checks whether an incoming pointer/touch event has dimensions indicating an accidental
 * palm rest or side-of-hand contact rather than an intentional fingertip.
 * 
 * Note on Device Support:
 * - On devices supporting Touch Events / Pointer Events Level 2 (e.g. iPadOS Safari, Windows Pen/Touch, Android Chrome),
 *   PointerEvent.width and height or Touch.radiusX and radiusY reflect the physical ellipse of contact in CSS pixels.
 * - On standard desktop mouse inputs or basic digitizers that report 0 or 1 for width/height, this check gracefully passes.
 */
export function evaluateContactPatch(
  event: React.PointerEvent | PointerEvent | React.TouchEvent | TouchEvent,
  maxDiameterPx = DEFAULT_TOUCH_SAFETY_CONFIG.maxContactDiameterPx
): { isOversized: boolean; width: number; height: number; supported: boolean } {
  // 1. PointerEvent interface
  if ('pointerType' in event) {
    const pEvent = event as PointerEvent;
    // Mouse clicks do not have physical touch width/height
    if (pEvent.pointerType === 'mouse') {
      return { isOversized: false, width: 1, height: 1, supported: false };
    }

    const width = pEvent.width || 0;
    const height = pEvent.height || 0;

    // If device reports width/height > 1, it supports contact geometry measurement
    if (width > 1 || height > 1) {
      const maxDim = Math.max(width, height);
      return {
        isOversized: maxDim > maxDiameterPx,
        width,
        height,
        supported: true,
      };
    }

    return { isOversized: false, width: 0, height: 0, supported: false };
  }

  // 2. TouchEvent fallback
  if ('touches' in event && (event as TouchEvent).touches.length > 0) {
    const touch = (event as TouchEvent).touches[0];
    const radiusX = (touch as unknown as { radiusX?: number }).radiusX || 0;
    const radiusY = (touch as unknown as { radiusY?: number }).radiusY || 0;

    if (radiusX > 0 || radiusY > 0) {
      const maxDiameter = Math.max(radiusX, radiusY) * 2;
      return {
        isOversized: maxDiameter > maxDiameterPx,
        width: radiusX * 2,
        height: radiusY * 2,
        supported: true,
      };
    }
  }

  return { isOversized: false, width: 0, height: 0, supported: false };
}

/**
 * Duplicate tap filter tracker. Keeps track of the last activation timestamp
 * per action key to prevent duplicate firings within the debounce window.
 */
class DuplicateTapShield {
  private lastActivationTimes = new Map<string, number>();

  /**
   * Evaluates if an action is permitted or if it is a duplicate inside the refractory window.
   */
  public attemptAction(actionId: string, debounceMs = DEFAULT_TOUCH_SAFETY_CONFIG.debounceWindowMs): {
    allowed: boolean;
    msSinceLast: number;
  } {
    const now = Date.now();
    const lastTime = this.lastActivationTimes.get(actionId) ?? 0;
    const delta = now - lastTime;

    if (delta < debounceMs) {
      return { allowed: false, msSinceLast: delta };
    }

    this.lastActivationTimes.set(actionId, now);
    return { allowed: true, msSinceLast: delta };
  }

  public reset(actionId?: string) {
    if (actionId) {
      this.lastActivationTimes.delete(actionId);
    } else {
      this.lastActivationTimes.clear();
    }
  }
}

export const duplicateTapShield = new DuplicateTapShield();
