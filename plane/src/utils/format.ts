// ── Date / time utilities ────────────────────────────────────

export function formatUtcTime(isoString?: string): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    const h = String(d.getUTCHours()).padStart(2, '0');
    const m = String(d.getUTCMinutes()).padStart(2, '0');
    return `${h}:${m}Z`;
  } catch {
    return '—';
  }
}

export function formatUtcDateTime(isoString?: string): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return d.toUTCString().replace('GMT', 'UTC').replace(', ', ' ').slice(0, -4) + 'UTC';
  } catch {
    return '—';
  }
}

export function ageMinutes(isoString?: string): number {
  if (!isoString) return 0;
  try {
    return Math.floor((Date.now() - new Date(isoString).getTime()) / 60000);
  } catch {
    return 0;
  }
}

export function ageLabel(isoString?: string): string {
  const m = ageMinutes(isoString);
  if (m < 1) return 'just now';
  if (m === 1) return '1 min ago';
  return `${m} min ago`;
}

export function etaDeltaMin(current?: string, previous?: string): number | null {
  if (!current || !previous) return null;
  try {
    return Math.round((new Date(current).getTime() - new Date(previous).getTime()) / 60000);
  } catch {
    return null;
  }
}

export function formatDeltaMin(delta: number | null): string {
  if (delta === null) return '—';
  if (delta === 0) return 'no change';
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta} min`;
}

// ── Number formatting ─────────────────────────────────────────

export function fmtAlt(ft: number): string {
  if (ft >= 1000) return `FL${Math.round(ft / 100)}`;
  return `${ft.toLocaleString()} ft`;
}

export function fmtKg(kg?: number): string {
  if (kg === undefined || kg === null) return '—';
  return `${Math.round(kg).toLocaleString()} kg`;
}

export function fmtKts(kts?: number): string {
  if (kts === undefined) return '—';
  return `${Math.round(kts)} kts`;
}

export function fmtNm(nm?: number): string {
  if (nm === undefined) return '—';
  return `${Math.round(nm)} NM`;
}

// ── Wind ──────────────────────────────────────────────────────

export function formatWind(dir?: number, speed?: number, gust?: number): string {
  if (dir === undefined || speed === undefined) return '—';
  const gustStr = gust ? `G${gust}` : '';
  return `${String(dir).padStart(3, '0')}°/${speed}${gustStr}KT`;
}

// ── Visibility ────────────────────────────────────────────────

export function formatVis(meters?: number): string {
  if (meters === undefined) return '—';
  if (meters >= 9999) return 'CAVOK';
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${meters} m`;
}

// ── Color helpers ─────────────────────────────────────────────

export function urgencyColor(urgency: string): string {
  switch (urgency) {
    case 'CRITICAL': return 'var(--color-critical)';
    case 'HIGH': return 'var(--color-high)';
    case 'MEDIUM': return 'var(--color-medium)';
    case 'LOW': return 'var(--color-low)';
    default: return 'var(--color-info)';
  }
}

export function connectionColor(status: string): string {
  switch (status) {
    case 'LIVE': return 'var(--color-live)';
    case 'DELAYED': return 'var(--color-medium)';
    case 'DISCONNECTED': return 'var(--color-critical)';
    default: return 'var(--color-info)';
  }
}

// ── Phase label ───────────────────────────────────────────────

export function phaseLabel(phase: string): string {
  return phase.replace(/_/g, ' ');
}
