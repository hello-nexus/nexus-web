import { useEffect, useRef } from 'react';
import type { WidgetView } from '../../types';
import { bind, bindColor, bindNumber, type RenderContext } from '../renderer';

interface RingBufferState {
  values: number[];
  cap: number;
  lastValue: number | null;
}

// Module-local ring-buffer state keyed by an authoring id so multiple
// instances of the same widget on a dashboard don't share history.
const buffers = new Map<string, RingBufferState>();

export function Sparkline({ view, ctx }: { view: WidgetView; ctx: RenderContext }) {
  const value = bindNumber(view.value, ctx, NaN);
  const userMin = bindNumber(view.min, ctx, NaN);
  const userMax = bindNumber(view.max, ctx, NaN);
  const points = Math.max(8, bindNumber(view.points, ctx, 60));
  const color = bindColor(view.color, ctx, 'var(--accent, currentColor)');
  // `mode: "line"` skips the under-fill polygon; default renders fill + line.
  const mode = (bind(view.mode, ctx) as string) === 'line' ? 'line' : 'filled';
  const fill = mode === 'line'
    ? 'none'
    : bindColor(view.fill, ctx, 'color-mix(in srgb, var(--accent, currentColor) 18%, transparent)');
  const stroke = bindNumber(view.thickness, ctx, 2);

  // scale: "adaptive" | "fixed" | "none".
  //   fixed    — clamp Y axis to [userMin..userMax] (default when both supplied).
  //   adaptive — stretch upper bound to the highest observed sample, snapped
  //              up to `step` and floored at `floor`.
  //   none     — pure observed-range (lo = min(data), hi = max(data)).
  // When scale isn't set explicitly: fall back to fixed if a userMax exists,
  // adaptive when only userMin is set, none otherwise.
  const scaleSpec = (bind(view.scale, ctx) as string | undefined) ?? undefined;
  const floor = bindNumber(view.floor, ctx, NaN);
  const step = bindNumber(view.step, ctx, NaN);
  const scaleMode: 'fixed' | 'adaptive' | 'none' =
    scaleSpec === 'fixed' ? 'fixed'
    : scaleSpec === 'adaptive' ? 'adaptive'
    : scaleSpec === 'none' ? 'none'
    : (Number.isFinite(userMax) ? 'fixed' : Number.isFinite(userMin) ? 'adaptive' : 'none');

  const seriesId = String(bind(view.series, ctx, ctx.widgetId) ?? ctx.widgetId);
  const ref = useRef<SVGPathElement | null>(null);
  const fillRef = useRef<SVGPathElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    let buf = buffers.get(seriesId);
    if (!buf || buf.cap !== points) {
      buf = { values: [], cap: points, lastValue: null };
      buffers.set(seriesId, buf);
    }
    if (Number.isFinite(value) && value !== buf.lastValue) {
      buf.values.push(value);
      if (buf.values.length > buf.cap) buf.values.shift();
      buf.lastValue = value;
    }
    // Build the path. Width / height are normalised; the SVG viewBox is
    // a fixed 100×30 grid and the parent stretches the svg via CSS.
    const data = buf.values;
    if (data.length < 2) {
      if (ref.current) ref.current.setAttribute('d', '');
      if (fillRef.current) fillRef.current.setAttribute('d', '');
      return;
    }
    let lo: number;
    let hi: number;
    if (scaleMode === 'fixed') {
      lo = Number.isFinite(userMin) ? userMin : 0;
      hi = Number.isFinite(userMax) ? userMax : 100;
    } else if (scaleMode === 'adaptive') {
      lo = Number.isFinite(userMin) ? userMin : 0;
      // Stretch hi to the max observed value, snap to `step`, floored at `floor`.
      let observed = 0;
      for (const v of data) if (Number.isFinite(v) && v > observed) observed = v;
      const stepN = Number.isFinite(step) && step > 0 ? step : 25;
      const floorN = Number.isFinite(floor) ? floor : 25;
      const cap = Number.isFinite(userMax) ? userMax : Number.POSITIVE_INFINITY;
      const stretched = Math.ceil(observed / stepN) * stepN;
      hi = Math.min(cap, Math.max(floorN, stretched));
    } else {
      lo = Number.isFinite(userMin) ? userMin : Math.min(...data);
      hi = Number.isFinite(userMax) ? userMax : Math.max(...data);
    }
    if (lo === hi) { lo -= 1; hi += 1; }
    const w = 100;
    const h = 30;
    const stepX = w / Math.max(1, buf.cap - 1);
    let d = '';
    for (let i = 0; i < data.length; i++) {
      const x = (buf.cap - data.length + i) * stepX;
      const t = (data[i] - lo) / (hi - lo);
      const y = h - Math.max(0, Math.min(1, t)) * h;
      d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ' ' + y.toFixed(2) + ' ';
    }
    if (ref.current) ref.current.setAttribute('d', d.trim());
    if (fillRef.current) {
      const last = data[data.length - 1];
      const xLast = (buf.cap - 1) * stepX;
      const xFirst = (buf.cap - data.length) * stepX;
      const fillPath = d.trim() + ` L ${xLast.toFixed(2)} ${h} L ${xFirst.toFixed(2)} ${h} Z`;
      fillRef.current.setAttribute('d', fillPath);
      void last;
    }
  });

  // flex:1 wrapper so the sparkline claims remaining vertical space in a flex
  // column; a bare SVG has intrinsic height 0 there and renders as a hairline.
  return (
    <div style={{
      width: '100%', flex: '1 1 0', minWidth: 0, minHeight: 0,
      display: 'block',
    }}>
      <svg
        ref={svgRef}
        viewBox="0 0 100 30"
        preserveAspectRatio="none"
        style={{ width: '100%', height: '100%', overflow: 'visible' }}
        aria-hidden="true"
      >
        <path ref={fillRef} fill={fill} stroke="none" />
        <path ref={ref} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
