import type { WidgetView } from '../../types';
import { bind, bindBoolean, bindColor, bindNumber, type RenderContext } from '../renderer';

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Horizontal range bar: fills the segment between `lo` and `hi` within
 * a global `[min, max]` axis. Used for daily H/L visualisations where
 * each day's bar sits inside the week's overall temperature range.
 *
 * Manifest shape:
 *   { type: "range", lo: "{item.lo}", hi: "{item.hi}",
 *     min: "{data.weekMin}", max: "{data.weekMax}",
 *     color: "accent", trackColor: "border", radius: 4 }
 */
export function Range({ view, ctx }: { view: WidgetView; ctx: RenderContext }) {
  const lo = bindNumber(view.lo, ctx, 0);
  const hi = bindNumber(view.hi, ctx, 0);
  const min = bindNumber(view.min, ctx, 0);
  const max = bindNumber(view.max, ctx, 100);
  const range = max - min;

  const lower = Math.min(lo, hi);
  const upper = Math.max(lo, hi);
  const leftPct = range === 0 ? 0 : clamp01((lower - min) / range);
  const rightPct = range === 0 ? 0 : clamp01((max - upper) / range);
  const fillPct = Math.max(0, 1 - leftPct - rightPct);

  // Gradient takes precedence over solid color. Used by the weather widget
  // to reproduce its blue → accent → amber daily H/L bar.
  const gradientSpec = Array.isArray(view.gradient) ? view.gradient as unknown[] : null;
  let background: string;
  if (gradientSpec && gradientSpec.length >= 2) {
    const stops = gradientSpec.map((c) => bindColor(c, ctx, 'currentColor')).join(', ');
    background = `linear-gradient(90deg, ${stops})`;
  } else {
    background = bindColor(view.color, ctx, 'var(--accent, currentColor)');
  }
  const glow = bindBoolean(view.glow, ctx, false);
  const trackColor = bindColor(view.trackColor, ctx, 'color-mix(in srgb, var(--panel-text, currentColor) 12%, transparent)');
  const ariaLabel = String(bind(view.label, ctx, '') ?? '');
  const radius = bindNumber(view.radius, ctx, 999);
  const height = bindNumber(view.height, ctx, NaN);

  return (
    <div role="img" aria-label={ariaLabel || undefined} style={{
      width: '100%',
      height: Number.isFinite(height) ? height : 'clamp(4px, 8cqi, 8px)',
      minHeight: Number.isFinite(height) ? height : 4,
      flex: '1 1 0',
      background: trackColor, borderRadius: radius, position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, bottom: 0,
        left: `${leftPct * 100}%`,
        width: `${fillPct * 100}%`,
        background,
        borderRadius: radius,
        boxShadow: glow ? '0 0 8px color-mix(in srgb, var(--accent, currentColor) 60%, transparent)' : undefined,
        transition: 'left 280ms cubic-bezier(0.3,0,0.2,1), width 280ms cubic-bezier(0.3,0,0.2,1), background 220ms ease-out',
      }} />
    </div>
  );
}
