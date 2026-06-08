// Formatting helpers exposed to authors so common widget needs (durations,
// clamping, percentages) don't get re-encoded per widget. Mirrors the subset of
// the declarative binding helpers that authors actually used.

export function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

export function pct(value: number, lo: number, hi: number): number {
  if (hi === lo) return 0;
  return clamp((value - lo) / (hi - lo), 0, 1);
}

/** ms -> "H:MM:SS" / "MM:SS" / ".HH" depending on mode (ports formatDurationMs). */
export function formatDuration(ms: number, mode: 'auto' | 'hms' | 'ms' | 'hmsAuto' | 'hundredths' | 'msHundredths' = 'auto'): string {
  if (!Number.isFinite(ms) || ms < 0) return mode === 'hundredths' ? '.00' : '00:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  const hundredths = Math.floor((ms % 1000) / 10);
  switch (mode) {
    case 'hms': return `${pad(h)}:${pad(m)}:${pad(s)}`;
    case 'ms': return `${pad(m)}:${pad(s)}`;
    case 'hundredths': return `.${pad(hundredths)}`;
    case 'msHundredths': return `${pad(m)}:${pad(s)}.${pad(hundredths)}`;
    case 'hmsAuto': return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
    default: return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }
}
