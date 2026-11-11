// Maps the SDK's semantic props to panel theme values. Authors never pass raw
// colours or CSS; they name a tone and the host resolves it to a panel token.
// This is what keeps every SDK widget visually consistent with native ones.

import type { UiTone } from '../contract/elements';

export function toneVar(tone: UiTone | string | undefined, fallback = 'currentColor'): string {
  switch (String(tone ?? '').toLowerCase()) {
    case 'accent':       return 'var(--accent, currentColor)';
    case 'accent-deep':  return 'var(--accent-deep, var(--accent, currentColor))';
    case 'accent-glow':  return 'var(--accent-glow, var(--accent, currentColor))';
    case 'good':         return 'var(--good, #10b981)';
    case 'warn':         return 'var(--warn, #f59e0b)';
    case 'bad':          return 'var(--bad, #ef4444)';
    case 'text':         return 'var(--text, currentColor)';
    case 'text-dim':     return 'var(--text-dim, currentColor)';
    case 'text-faded':   return 'var(--text-dim, currentColor)';
    case 'border':       return 'var(--border, currentColor)';
    case 'bg-card':      return 'var(--surface, transparent)';
    case '':             return fallback;
    case 'currentcolor': return 'currentColor';
    default:             return fallback;
  }
}

/**
 * Ink for a glyph on a solid fill of `tone`: the accent's paired text for accent tones, the page
 * background for text tones (the fill is the text color), white for good and bad as Button's
 * danger-solid does, and the page background for warn (amber needs dark ink). Undefined for no tone.
 */
export function thumbInkVar(tone: UiTone | string | undefined): string | undefined {
  switch (String(tone ?? '').toLowerCase()) {
    case 'accent': case 'accent-deep': case 'accent-glow': return 'var(--accent-text)';
    case 'text': case 'text-dim': case 'text-faded': case 'warn': return 'var(--bg)';
    case 'good': case 'bad': return '#fff';
    case 'border': case 'bg-card': return 'var(--text)';
    default: return undefined;
  }
}

/** Text colour for a tone; accent tones yield to a panel's custom text colour (--panel-ink-accent). */
export function textToneVar(tone: UiTone | string | undefined, fallback?: string): string {
  const value = toneVar(tone, fallback);
  return String(tone ?? '').toLowerCase().startsWith('accent') ? `var(--panel-ink-accent, ${value})` : value;
}

const ALIGN: Record<string, string> = {
  start: 'flex-start', center: 'center', end: 'flex-end', baseline: 'baseline', stretch: 'stretch',
};
const JUSTIFY: Record<string, string> = {
  start: 'flex-start', center: 'center', end: 'flex-end',
  between: 'space-between', around: 'space-around',
};
const WEIGHT: Record<string, number> = {
  light: 300, regular: 400, medium: 500, semibold: 600, bold: 700, black: 900,
};

export const alignValue = (a: string | undefined, fallback = 'stretch'): string => ALIGN[String(a ?? '')] ?? fallback;
export const justifyValue = (j: string | undefined, fallback = 'flex-start'): string => JUSTIFY[String(j ?? '')] ?? fallback;
export const weightValue = (w: string | undefined): number | undefined => (w ? WEIGHT[w] : undefined);

/** Numeric or string size pass-through (`14` -> "14px", "2.6em" -> "2.6em"). */
export const cssSize = (v: number | string | undefined): string | undefined => {
  if (v == null) return undefined;
  return typeof v === 'number' ? `${v}px` : v;
};
