import type { CSSProperties } from 'react';
import type { WidgetView } from '../../types';
import { bind, bindColor, bindNumber, renderView, type RenderContext } from '../renderer';

interface ThresholdSpec {
  above?: unknown;
  below?: unknown;
  color?: unknown;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function Ring({ view, ctx }: { view: WidgetView; ctx: RenderContext }) {
  const value = bindNumber(view.value, ctx, 0);
  const min = bindNumber(view.min, ctx, 0);
  const max = bindNumber(view.max, ctx, 100);
  const range = max - min;
  const pct = range === 0 ? 0 : clamp01((value - min) / range);

  // Determine ring colour. Thresholds override `color` when their bound
  // value crosses the boundary.
  let color = bindColor(view.color, ctx, 'var(--accent, var(--cpu-temp-ring-color, #ff8800))');
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

  const trackColor = bindColor(view.trackColor, ctx, 'color-mix(in srgb, var(--panel-text, currentColor) 14%, transparent)');
  const thickness = bindNumber(view.thickness, ctx, 12);
  const radius = 50 - thickness / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);

  const center = view.center as WidgetView | undefined;
  const ariaLabel = String(bind(view.label, ctx, '') ?? '');

  const wrapStyle: CSSProperties = {
    position: 'relative',
    width: '100%',
    height: '100%',
    aspectRatio: '1 / 1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  return (
    <div style={wrapStyle} role="img" aria-label={ariaLabel || undefined}>
      <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx="50" cy="50" r={radius} fill="none" stroke={trackColor} strokeWidth={thickness} />
        <circle
          cx="50" cy="50" r={radius}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: 'stroke-dashoffset 320ms cubic-bezier(0.3, 0, 0.2, 1), stroke 220ms ease-out',
            filter: `drop-shadow(0 0 6px color-mix(in srgb, ${color} 55%, transparent))`,
          }}
        />
      </svg>
      {center ? (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          pointerEvents: 'none',
        }}>
          {renderView(center, ctx)}
        </div>
      ) : null}
    </div>
  );
}
