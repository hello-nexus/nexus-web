// Gauge meter. Renders a circular arc with fill driven by `value` mapped
// over [min, max]. The arc sweep is configurable via `arc` (degrees,
// 180 default for the classic semicircle; 270 = legacy arc270 design;
// 360 = full ring).
//
// Manifest shape:
//   { "type": "gauge",
//     "value": "{data.cpu.load.value}",
//     "min": 0, "max": 100,
//     "arc": 270,          // sweep in degrees, default 180
//     "color": "accent",
//     "thickness": 10,
//     "thresholds": [{ "above": 80, "color": "warn" }],
//     "center": { "type": "value", "text": "{data.cpu.load.value}", "unit": "%" } }

import type { WidgetView } from '../../types';
import { bind, bindColor, bindNumber, renderView, type RenderContext } from '../renderer';

interface ThresholdSpec { above?: unknown; below?: unknown; color?: unknown; }

function clamp01(n: number): number { return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0)); }

export function Gauge({ view, ctx }: { view: WidgetView; ctx: RenderContext }) {
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
  const thickness = bindNumber(view.thickness, ctx, 10);
  const arcDeg = Math.max(10, Math.min(360, bindNumber(view.arc, ctx, 180)));

  const center = view.center as WidgetView | undefined;
  const ariaLabel = String(bind(view.label, ctx, '') ?? '');

  // The arc is positioned so its centre sits at (50, 50). For half-arcs
  // (≤ 180°) we anchor the gap at the bottom (start angle 180°, sweep
  // clockwise to 360°); for wider arcs the gap stays centred at the
  // bottom by adjusting the start angle symmetrically.
  const radius = 38;
  const startAngle = 90 + arcDeg / 2; // measured from 12 o'clock, clockwise
  const start = polar(50, 50, radius, startAngle);
  const endAngle = startAngle - arcDeg;
  const end = polar(50, 50, radius, endAngle);
  const largeArc = arcDeg > 180 ? 1 : 0;
  const arcPath = `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
  const arcLen = (arcDeg / 360) * 2 * Math.PI * radius;
  const offset = arcLen * (1 - pct);

  // For arc ≥ 180 the viewBox needs to be square; for half-arcs we keep
  // a 100×60 viewbox so the gauge sits flush against the bottom.
  const viewBox = arcDeg <= 180 ? '0 0 100 60' : '0 0 100 100';

  return (
    <div style={{
      width: '100%', height: '100%', position: 'relative',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} role="img" aria-label={ariaLabel || undefined}>
      <svg viewBox={viewBox} style={{ width: '100%', height: '100%' }} aria-hidden="true">
        <path d={arcPath} fill="none" stroke={trackColor} strokeWidth={thickness} strokeLinecap="round" />
        <path
          d={arcPath}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={arcLen}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 320ms cubic-bezier(0.3,0,0.2,1), stroke 220ms ease-out' }}
        />
      </svg>
      {center ? (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
          pointerEvents: 'none',
          padding: arcDeg <= 180 ? '30% 12% 8%' : '20% 18%',
          boxSizing: 'border-box',
        }}>
          {renderView(center, ctx)}
        </div>
      ) : null}
    </div>
  );
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}
