import type { WidgetView } from '../../types';
import { bind, bindColor, bindNumber, type RenderContext } from '../renderer';

interface ThresholdSpec { above?: unknown; below?: unknown; color?: unknown; }

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function Bar({ view, ctx }: { view: WidgetView; ctx: RenderContext }) {
  const value = bindNumber(view.value, ctx, 0);
  const min = bindNumber(view.min, ctx, 0);
  const max = bindNumber(view.max, ctx, 100);
  const range = max - min;
  const pct = range === 0 ? 0 : clamp01((value - min) / range);

  let color = bindColor(view.color, ctx, 'var(--accent, currentColor)');
  const thresholds = (view.thresholds as ThresholdSpec[] | undefined) ?? [];
  for (const t of thresholds) {
    if (t.above != null) {
      const limit = bindNumber(t.above, ctx, NaN);
      if (Number.isFinite(limit) && value >= limit) color = bindColor(t.color, ctx, color);
    }
    if (t.below != null) {
      const limit = bindNumber(t.below, ctx, NaN);
      if (Number.isFinite(limit) && value <= limit) color = bindColor(t.color, ctx, color);
    }
  }

  const trackColor = bindColor(view.trackColor, ctx, 'color-mix(in srgb, var(--panel-text, currentColor) 12%, transparent)');
  const orientation = (bind(view.orientation, ctx) as string) ?? 'horizontal';
  const ariaLabel = String(bind(view.label, ctx, '') ?? '');
  const segments = Math.max(0, bindNumber(view.segments, ctx, 0));

  // Discrete-segment mode: stack `segments` cells along the orientation
  // axis and light up the bottom-most/left-most N matching `pct`.
  if (segments > 0) {
    const filledCount = Math.round(pct * segments);
    const stackDirection: 'column' | 'row' = orientation === 'vertical' ? 'column' : 'row';
    const cells: React.ReactElement[] = [];
    for (let i = 0; i < segments; i++) {
      // Index from the "bottom" / "start" so partial fills look right.
      const fromStart = orientation === 'vertical' ? (segments - 1 - i) : i;
      const on = fromStart < filledCount;
      cells.push(
        <div key={i} style={{
          flex: 1, minWidth: 0, minHeight: 0,
          borderRadius: 2,
          background: on ? color : trackColor,
          opacity: on ? 1 : 0.5,
          transition: 'background-color 90ms ease, opacity 90ms ease',
          boxShadow: on ? 'inset 0 1px 0 color-mix(in srgb, white 18%, transparent)'
                        : 'inset 0 1px 0 color-mix(in srgb, white 10%, transparent)',
        }} />
      );
    }
    return (
      <div role="img" aria-label={ariaLabel || undefined} style={{
        width: '100%', height: '100%',
        display: 'flex', flexDirection: stackDirection,
        gap: 'clamp(2px, 0.5cqi, 4px)',
        padding: 4, boxSizing: 'border-box',
        minWidth: 0, minHeight: 0,
      }}>{cells}</div>
    );
  }

  if (orientation === 'vertical') {
    return (
      <div role="img" aria-label={ariaLabel || undefined} style={{
        width: '100%', height: '100%',
        background: trackColor, borderRadius: 4, position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          height: `${pct * 100}%`, background: color,
          transition: 'height 280ms cubic-bezier(0.3,0,0.2,1), background 220ms ease-out',
        }} />
      </div>
    );
  }

  // 8 px matches the slider track plus a hair, since the bar has no
  // draggable thumb to add visual weight. Authors override via `height`.
  const explicitHeight = bindNumber(view.height, ctx, NaN);
  const barHeight = Number.isFinite(explicitHeight) ? explicitHeight : 8;
  return (
    <div role="img" aria-label={ariaLabel || undefined} style={{
      width: '100%', height: barHeight, minHeight: barHeight, flexShrink: 0,
      background: trackColor, borderRadius: 999, position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        width: `${pct * 100}%`, background: color,
        borderRadius: 999,
        transition: 'width 280ms cubic-bezier(0.3,0,0.2,1), background 220ms ease-out',
      }} />
    </div>
  );
}
