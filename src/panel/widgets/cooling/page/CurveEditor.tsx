import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '../../../../components/common/Button/Button';
import { Minus, TrendingUp, Activity, Combine, Trash2, RotateCcw, Pencil, ToggleRight, Link, Wand2 } from 'lucide-react';
import type { CurvePoint, FanChannel, TemperatureSource } from '../../../../api/cooling';
import { useUnitPrefs } from '../../../../hooks/useUiSettings';
import { useTranslation } from '../../../../lib/i18n';
import { localizeNumbers } from '../../../../lib/units';
import type { CurveDef, CurveType, MixFn } from '../../../../types/cooling';
import { PromptModal } from '../../../../components/common/PromptModal/PromptModal';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import { InfoTooltip } from '../../../../components/common/InfoTooltip/InfoTooltip';
import { ChartHoverTooltip, ChartTooltipRow, ChartTooltipVal } from '../../../../components/common/ChartHoverTooltip/ChartHoverTooltip';
import { useChartHoverTooltip } from '../../../../hooks/useChartHoverTooltip';
import { Slider } from '../../../../components/common/Slider/Slider';
import { RangeSlider } from '../../../../components/common/Slider/RangeSlider';
import { Select } from '../../../../components/common/Select/Select';
import { isModeCurveDirty } from './coolingModes';
import { interpolateCurve, type CurveEasing, type CurveWrap } from '../../../../lib/curveEasing';
import styles from '../CoolingPage.module.scss';

const CURVE_TYPES: { key: CurveType; labelKey: string; hintKey: string; icon: ReactNode }[] = [
  { key: 'flat', labelKey: 'cooling.curve.type.fixed', hintKey: 'cooling.curve.fixed.hint', icon: <Minus size={14} /> },
  { key: 'linear', labelKey: 'cooling.curve.type.linear', hintKey: 'cooling.curve.linear.hint', icon: <TrendingUp size={14} /> },
  { key: 'multipoint', labelKey: 'cooling.curve.type.custom', hintKey: 'cooling.curve.graph.hint', icon: <Activity size={14} /> },
  { key: 'mix', labelKey: 'cooling.curve.type.mix', hintKey: 'cooling.curve.mix.hint', icon: <Combine size={14} /> },
  { key: 'trigger', labelKey: 'cooling.curve.type.trigger', hintKey: 'cooling.curve.trigger.hint', icon: <ToggleRight size={14} /> },
  { key: 'sync', labelKey: 'cooling.curve.type.sync', hintKey: 'cooling.curve.sync.hint', icon: <Link size={14} /> },
  { key: 'auto', labelKey: 'cooling.curve.type.auto', hintKey: 'cooling.curve.auto.hint', icon: <Wand2 size={14} /> },
];

// Sum is intentionally omitted from the UI -- the backend still honors it for
// any existing saved curves, but we don't offer it as a selectable option.
const MIX_FNS: { key: MixFn; labelKey: string }[] = [
  { key: 'min', labelKey: 'cooling.curve.mix.fn.min' },
  { key: 'max', labelKey: 'cooling.curve.mix.fn.max' },
  { key: 'avg', labelKey: 'cooling.curve.mix.fn.avg' },
];

// Sync applies its offset either as a percentage of the source's duty or as a
// number of duty points, matching the two modes the engine implements.
const SYNC_MODES: { proportional: boolean; labelKey: string }[] = [
  { proportional: false, labelKey: 'cooling.curve.sync.points' },
  { proportional: true, labelKey: 'cooling.curve.sync.percent' },
];

// Mirror of the backend curve engine so the UI can show a live preview value
// for every curve (and power the Mix output read-out). Flat -> fixed speed;
// Linear -> lerp over the min/max temp band; Multipoint -> piecewise-linear
// interpolation; Mix -> fn applied to the referenced curves' own outputs.
// Co-located with the editor on purpose - it's the canonical curve math and
// every consumer (graph + cards + view) imports it from here.

export function computeCurveSpeed(
  curve: CurveDef,
  sources: TemperatureSource[],
  allCurves: CurveDef[],
  seen: Set<string> = new Set(),
  channels: FanChannel[] = [],
): number {
  if (seen.has(curve.id)) return 0;
  seen.add(curve.id);
  if (curve.type === 'flat') return curve.flat.speed;
  if (curve.type === 'linear') {
    const src = sources.find(s => s.id === curve.sourceId);
    if (!src) return 0;
    const span = curve.linear.maxTemp - curve.linear.minTemp;
    const t01 = span > 0 ? Math.max(0, Math.min(1, (src.value - curve.linear.minTemp) / span)) : 0;
    return curve.linear.minSpeed + t01 * (curve.linear.maxSpeed - curve.linear.minSpeed);
  }
  if (curve.type === 'multipoint') {
    const src = sources.find(s => s.id === curve.sourceId);
    if (!src || curve.multipoint.points.length === 0) return 0;
    const pts = [...curve.multipoint.points].sort((a, b) => a.temp - b.temp);
    const temp = src.value;
    if (temp <= pts[0].temp) return pts[0].speed;
    if (temp >= pts[pts.length - 1].temp) return pts[pts.length - 1].speed;
    for (let i = 0; i < pts.length - 1; i++) {
      if (temp >= pts[i].temp && temp <= pts[i + 1].temp) {
        const f = (temp - pts[i].temp) / (pts[i + 1].temp - pts[i].temp);
        return pts[i].speed + f * (pts[i + 1].speed - pts[i].speed);
      }
    }
    return pts[pts.length - 1].speed;
  }
  if (curve.type === 'mix') {
    const inputs = curve.mix.curveIds
      .map(id => allCurves.find(c => c.id === id))
      .filter((c): c is CurveDef => !!c)
      .map(c => computeCurveSpeed(c, sources, allCurves, seen, channels));
    if (inputs.length === 0) return 0;
    if (curve.mix.fn === 'min') return Math.min(...inputs);
    if (curve.mix.fn === 'max') return Math.max(...inputs);
    if (curve.mix.fn === 'avg') return inputs.reduce((a, b) => a + b, 0) / inputs.length;
    if (curve.mix.fn === 'sum') return Math.min(100, inputs.reduce((a, b) => a + b, 0));
    if (curve.mix.fn === 'subtract') {
      return Math.max(0, Math.min(100, inputs.reduce((a, b) => a - b)));
    }
  }
  if (curve.type === 'trigger') {
    const src = sources.find(s => s.id === curve.sourceId);
    if (!src) return 0;
    // The engine latches, holding the last speed between the thresholds. The
    // preview has no latch to read, so it shows which side the temperature is
    // closer to, which is where the curve settles.
    const { idleTemp, loadTemp, idleSpeed, loadSpeed } = curve.trigger;
    if (src.value >= loadTemp) return loadSpeed;
    if (src.value <= idleTemp) return idleSpeed;
    return src.value >= (idleTemp + loadTemp) / 2 ? loadSpeed : idleSpeed;
  }
  if (curve.type === 'auto') {
    const src = sources.find(s => s.id === curve.sourceId);
    if (!src) return 0;
    // Below the load band the controller settles on this ramp; at load it
    // steps around it, so the ramp is the honest steady-state preview.
    const { idleTemp, loadTemp, minSpeed, maxSpeed } = curve.auto;
    const span = loadTemp - idleTemp;
    if (span <= 0) return maxSpeed;
    const t01 = Math.max(0, Math.min(1, (src.value - idleTemp) / span));
    return minSpeed + t01 * (maxSpeed - minSpeed);
  }
  if (curve.type === 'sync') {
    const source = channels.find(c => c.id === curve.sync.sourceChannelId);
    if (!source) return 0;
    const duty = source.dutyPercent ?? 0;
    const out = curve.sync.proportional
      ? duty * (1 + curve.sync.offset / 100)
      : duty + curve.sync.offset;
    return Math.max(0, Math.min(100, out));
  }
  return 0;
}

// ── Response time helper ──────────────────────────────────────────────────
// Wraps the canonical Slider with the seconds formatter so callers stay terse.
function ResponseTimeSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  return (
    <Slider
      // eslint-disable-next-line i18next/no-literal-string -- slider layout enum
      orientation="stacked" editable label={t('cooling.curve.response')}
      info={t('cooling.curve.response.help')} value={value}
      min={0.1} max={5.0} step={0.1} trackFill
      formatValue={v => t('cooling.curve.responseSeconds', { value: localizeNumbers(v.toFixed(1), numberFormat) })} onChange={onChange} />
  );
}

// ── SVG Curve Graph ────────────────────────────────────────────────────────

const TEMP_MIN = 20, TEMP_MAX = 100;
// Inner SVG padding reserves space inside the chart frame. Axis labels are
// rendered as HTML (not SVG text) in .curveYAxis / .curveXAxis gutters OUTSIDE
// the SVG, so they can never clip into the chart bars/lines.
const PAD = { left: 8, right: 8, top: 8, bottom: 8 };
const GRAPH_H = 140;
// Hero graph on the desktop cooling page.
const PINNED_GRAPH_H = 190;
// °C step for read-only curve sampling (Fixed / Linear / Mix lines).
const SAMPLE_STEP = 2;
const H_LINES = [0, 25, 50, 75, 100];
const V_LINES: number[] = []; for (let v = 20; v <= 100; v += 10) V_LINES.push(v);

/** Re-labels CurveGraph for a non-temperature x axis. Every field is optional
 *  and falls back to the cooling defaults (°C ticks, temp/duty tooltip rows). */
export interface CurveGraphAxis {
  /** Grid + label step along x (default 10 over a wide span, 5 over a narrow one). */
  xStep?: number;
  /** Label under an x grid line, also the handle tooltip's x value. */
  formatX?: (v: number) => string;
  /** Live x readout under the current-value dot. */
  formatLiveX?: (v: number) => string;
  /** Handle tooltip row names. */
  xName?: string;
  yName?: string;
  /** The axis is circular (hours of a day): past the outermost points the line
   *  continues from the last point back to the first across the edge. */
  wrap?: boolean;
}

// Samples across the chart width for a drawn curve (or a wrapping line);
// one every few pixels at the widest chart, invisible as a polyline.
const SHAPE_SAMPLES = 192;

// Content key for a point set; the hover-clear effect and the drag-commit
// hold compare these, so both sides must derive it identically.
const pointsKeyOf = (pts: CurvePoint[]) => pts.map(pt => `${pt.temp},${pt.speed}`).join(' ');

// Plot a curve's shape across the 20-100°C axis by evaluating it with every
// source swept to the same temperature. Works for every type, including Mix
// (its inputs evaluate at the same swept temperature), giving one line on a
// single axis. Multipoint plots its own points instead.
function sampleCurveShape(
  curve: CurveDef, allCurves: CurveDef[], sources: TemperatureSource[], channels: FanChannel[] = [],
): CurvePoint[] {
  const out: CurvePoint[] = [];
  for (let temp = TEMP_MIN; temp <= TEMP_MAX; temp += SAMPLE_STEP) {
    const swept = sources.map(s => ({ ...s, value: temp }));
    out.push({ temp, speed: Math.max(0, Math.min(100, computeCurveSpeed(curve, swept, allCurves, new Set(), channels))) });
  }
  return out;
}

// `showPoints` (default true) renders the curve's points as markers for
// multipoint curves; when false the graph is just a line (Fixed / Linear / Mix
// shapes). `currentTemp` draws a temperature line from the top down to a dot on
// the curve. `height` sizes the SVG + its y-axis gutter (CSS default 140).
// `tempMin`/`tempMax` set the x-axis span (default 20-100). When `editable`, the
// point markers can be dragged (clamped between their neighbours and 0-100% duty,
// snapped to whole units), double-click adds a point at the cursor and right-click
// removes one (down to 2); `onChange` fires with the new point set. Hovering or
// dragging a marker shows its exact temp/duty on the axes. `axis` re-labels the
// chart for a non-temperature x (the brightness schedule plots hours): the
// point shape stays `temp`/`speed` so the drag, add and remove logic is shared.
// `easing` picks how the line travels between points (default the engine's
// piecewise-linear rule); the live dot follows the same rule.
export function CurveGraph({
  points, currentTemp, showPoints = true, height = GRAPH_H,
  tempMin = TEMP_MIN, tempMax = TEMP_MAX, editable = false, onChange, onPreview, limitPercent, axis, easing = 'linear',
}: {
  points: CurvePoint[];
  currentTemp?: number;
  showPoints?: boolean;
  height?: number;
  tempMin?: number;
  tempMax?: number;
  editable?: boolean;
  onChange?: (points: CurvePoint[]) => void;
  /** Fires continuously during a drag (live preview, before commit). */
  onPreview?: (points: CurvePoint[]) => void;
  /** Draws a dashed horizontal ceiling line at this duty %, e.g. a turbo-off cap. */
  limitPercent?: number;
  axis?: CurveGraphAxis;
  easing?: CurveEasing;
}) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const formatX = axis?.formatX ?? ((v: number) => `${v}°`);
  const formatLiveX = axis?.formatLiveX
    ?? ((v: number) => t('cooling.curve.tempBadge', { temp: localizeNumbers(v.toFixed(1), numberFormat) }));
  const xName = axis?.xName ?? t('cooling.curve.tooltipTemp');
  const yName = axis?.yName ?? t('cooling.curve.tooltipDuty');
  const wrap = useMemo<CurveWrap | undefined>(
    () => (axis?.wrap ? { min: tempMin, max: tempMax } : undefined), [axis?.wrap, tempMin, tempMax]);
  const svgRef = useRef<SVGSVGElement>(null);
  const chartAreaRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(400);
  const rafWidthRef = useRef(0);
  // Optimistic points while dragging a handle; null when idle (props own the data).
  const [dragPoints, setDragPoints] = useState<CurvePoint[] | null>(null);
  const dragIdxRef = useRef<number | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  // Our own drag commit keeps indices (points are clamped between neighbours)
  // and the cursor still rests on the dot, so the hover holds across it: the
  // ref carries the committed key and the effect suppresses the clear only on
  // an exact match - a parent that ignores or transforms the commit (CurveHost
  // apps) can never leave a hold that swallows a real external change.
  const holdHoverKeyRef = useRef<string | null>(null);
  // An external points change re-orders indices without a pointerleave, so a
  // held hover could name a different point's values. Keyed on content, not
  // identity: some callers rebuild the array every render (CurveHost).
  const pointsKey = useMemo(() => pointsKeyOf(points), [points]);
  useEffect(() => {
    const held = holdHoverKeyRef.current;
    holdHoverKeyRef.current = null;
    if (held !== pointsKey) setHoverIdx(null);
  }, [pointsKey]);

  useEffect(() => {
    const el = svgRef.current?.parentElement;
    if (!el) return;
    const w = el.getBoundingClientRect().width;
    // Sync the initial measured width before the ResizeObserver fires (it
    // wouldn't fire on a steady-state mount).
    if (w > 0) setWidth(Math.round(w));
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const w2 = e.contentRect.width;
        if (w2 > 0) {
          cancelAnimationFrame(rafWidthRef.current);
          rafWidthRef.current = requestAnimationFrame(() => setWidth(Math.round(w2)));
        }
      }
    });
    ro.observe(el);
    return () => { ro.disconnect(); cancelAnimationFrame(rafWidthRef.current); };
  }, []);

  const chartW = width - PAD.left - PAD.right, chartH = height - PAD.top - PAD.bottom;
  const tempToX = (tp: number) => PAD.left + ((tp - tempMin) / (tempMax - tempMin)) * chartW;
  const speedToY = (s: number) => PAD.top + chartH - (s / 100) * chartH;
  // While a handle is dragged, the optimistic copy drives the render.
  const activePoints = dragPoints ?? points;
  const sorted = useMemo(() => [...activePoints].sort((a, b) => a.temp - b.temp), [activePoints]);
  // Handle readout while dragging or hovering a point: a hover box (the
  // shared chart tooltip) glued to the handle, naming its exact temp/duty.
  // The live-temp indicator stays untouched. dragIdxRef is only consulted
  // when dragPoints says a drag is live, so the ref read tracks state.
  const readoutIdx = dragPoints !== null ? dragIdxRef.current : hoverIdx;
  const readoutPt = editable && readoutIdx !== null && readoutIdx < sorted.length ? sorted[readoutIdx] : undefined;
  const { tooltipRef, trackPoint } = useChartHoverTooltip(chartAreaRef, readoutPt !== undefined, { anchor: 'follow' });
  // The svg's viewBox width/height mirror its layout size, and it sits at the
  // wrapper's origin, so chart coordinates are wrapper layout px. Layout
  // effect: runs after the hook's own re-place, so the anchor wins the frame.
  useLayoutEffect(() => {
    if (readoutPt) trackPoint(tempToX(readoutPt.temp), speedToY(readoutPt.speed));
  });
  // X-axis grid + labels at ~10° steps (5° for a narrow span). For the default
  // 20-100 range this reproduces the original 20,30,…,100 ticks.
  const xStep = axis?.xStep;
  const vLines = useMemo(() => {
    const step = xStep ?? ((tempMax - tempMin) > 40 ? 10 : 5);
    const out: number[] = [];
    for (let v = Math.ceil(tempMin / step) * step; v <= tempMax; v += step) out.push(v);
    return out;
  }, [tempMin, tempMax, xStep]);
  // The drawn line. Linear on a plain axis is the points themselves, extended
  // flat to the chart edges the way the engine clamps outside the point
  // range. A curve or a wrapping axis is sampled across the width instead,
  // through the same rule the live dot uses. The point markers below still
  // sit only on the real points.
  const shape = useMemo(() => {
    if (sorted.length === 0) return sorted;
    if (easing === 'linear' && !wrap) {
      const out = [...sorted];
      if (out[0].temp > tempMin) out.unshift({ temp: tempMin, speed: out[0].speed });
      if (out[out.length - 1].temp < tempMax) out.push({ temp: tempMax, speed: out[out.length - 1].speed });
      return out;
    }
    const out: CurvePoint[] = [];
    for (let k = 0; k <= SHAPE_SAMPLES; k++) {
      const temp = tempMin + ((tempMax - tempMin) * k) / SHAPE_SAMPLES;
      out.push({ temp, speed: interpolateCurve(sorted, temp, easing, wrap) });
    }
    return out;
  }, [sorted, tempMin, tempMax, wrap, easing]);
  const linePath = shape.map((p, i) => `${i === 0 ? 'M' : 'L'} ${tempToX(p.temp)} ${speedToY(p.speed)}`).join(' ');
  const areaPath = shape.length > 0 ? linePath + ` L ${tempToX(shape[shape.length - 1].temp)} ${speedToY(0)} L ${tempToX(shape[0].temp)} ${speedToY(0)} Z` : '';

  // The rendered line's value at an arbitrary temp, for the current-temperature dot.
  const speedAtTemp = (tt: number): number => interpolateCurve(sorted, tt, easing, wrap);

  // Invert a pixel position back to (temp, duty) in chart space; used by the
  // drag handler and double-click-to-add.
  const pointerToData = (e: { clientX: number; clientY: number }) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const vbX = ((e.clientX - rect.left) / rect.width) * width;
    const vbY = ((e.clientY - rect.top) / rect.height) * height;
    return {
      temp: tempMin + ((vbX - PAD.left) / chartW) * (tempMax - tempMin),
      speed: ((PAD.top + chartH - vbY) / chartH) * 100,
    };
  };
  const onHandleDown = (idx: number, e: React.PointerEvent) => {
    if (!editable) return;
    e.preventDefault(); e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragIdxRef.current = idx;
    setDragPoints(sorted);
  };
  const onHandleMove = (e: React.PointerEvent) => {
    const i = dragIdxRef.current;
    if (i === null) return;
    const base = (dragPoints ?? sorted).slice().sort((a, b) => a.temp - b.temp);
    const lo = i > 0 ? base[i - 1].temp : tempMin;
    const hi = i < base.length - 1 ? base[i + 1].temp : tempMax;
    const { temp, speed } = pointerToData(e);
    const next = base.slice();
    next[i] = {
      temp: Math.round(Math.max(lo, Math.min(hi, temp))),
      speed: Math.round(Math.max(0, Math.min(100, speed))),
    };
    setDragPoints(next);
    onPreview?.(next);
  };
  const onHandleUp = () => {
    if (dragIdxRef.current === null) return;
    const draggedIdx = dragIdxRef.current;
    dragIdxRef.current = null;
    const committed = dragPoints;
    setDragPoints(null);
    if (committed) {
      // pointerleave still clears the hover when the cursor ends up off the
      // dot (clamped drags, touch lift).
      holdHoverKeyRef.current = pointsKeyOf(committed);
      setHoverIdx(draggedIdx);
      onChange?.(committed);
    }
  };
  // The engine clamps outside the point range, so an added point only needs to
  // land in 0-100 / tempMin-tempMax. Removal floors at 2 points. Both abandon
  // any in-flight drag so a stale dragIdx can't write into the new point set.
  const onAddPoint = (e: React.MouseEvent) => {
    if (!editable || !onChange) return;
    const { temp, speed } = pointerToData(e);
    dragIdxRef.current = null; setDragPoints(null); setHoverIdx(null);
    onChange([...sorted, {
      temp: Math.round(Math.max(tempMin, Math.min(tempMax, temp))),
      speed: Math.round(Math.max(0, Math.min(100, speed))),
    }].sort((a, b) => a.temp - b.temp));
  };
  const onRemovePoint = (idx: number, e: React.MouseEvent) => {
    if (!editable || !onChange) return;
    e.preventDefault();
    if (sorted.length <= 2) return;
    dragIdxRef.current = null; setDragPoints(null); setHoverIdx(null);
    onChange(sorted.filter((_, i) => i !== idx));
  };

  // Intersection of the live source temperature with the curve. Drives the
  // dot, the two dotted guide lines (up from the bottom temp axis, in from the
  // right duty axis), and the live temp/duty readouts on those axes.
  const hasDot = typeof currentTemp === 'number' && currentTemp >= tempMin && currentTemp <= tempMax;
  const dotSpeed = hasDot ? speedAtTemp(currentTemp!) : 0;
  const dotX = hasDot ? tempToX(currentTemp!) : 0;
  const dotY = hasDot ? speedToY(dotSpeed) : 0;
  const dotLeftPct = hasDot ? ((currentTemp! - tempMin) / (tempMax - tempMin)) * 100 : 0;

  return (
    <div className={styles.curveGraphWrap}>
      <div className={styles.curveGraphFrame}>
        <div className={styles.curveChartArea}>
          <div ref={chartAreaRef} className={styles.curveSvgWrap}>
          <svg ref={svgRef} className={styles.curveGraph} style={{ height, touchAction: editable ? 'none' : undefined }} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none"
            onDoubleClick={editable ? onAddPoint : undefined}>
            {H_LINES.map(s => (<g key={`h${s}`}><line x1={PAD.left} y1={speedToY(s)} x2={width - PAD.right} y2={speedToY(s)} className={styles.gridLine} /></g>))}
            {vLines.map(v => (<g key={`v${v}`}><line x1={tempToX(v)} y1={PAD.top} x2={tempToX(v)} y2={height - PAD.bottom} className={styles.gridLine} /></g>))}
            <defs><linearGradient id="curveGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" /><stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" /></linearGradient></defs>
            {areaPath && <path d={areaPath} fill="url(#curveGrad)" />}
            <path d={linePath} fill="none" stroke="var(--accent-glow)" strokeWidth="2.5" />
            {typeof limitPercent === 'number' && (
              <line x1={PAD.left} y1={speedToY(Math.max(0, Math.min(100, limitPercent)))}
                x2={width - PAD.right} y2={speedToY(Math.max(0, Math.min(100, limitPercent)))}
                className={styles.curveLimitLine} />
            )}
            {hasDot && (
              <g className={styles.curveTempIndicator}>
                {/* Guide lines meet at the dot: one up from the bottom temp
                    axis, one in from the right duty axis. */}
                <line x1={dotX} y1={height - PAD.bottom} x2={dotX} y2={dotY} className={styles.tempLine} />
                <line x1={width - PAD.right} y1={dotY} x2={dotX} y2={dotY} className={styles.tempLine} />
                <circle cx={dotX} cy={dotY} r={4} className={styles.tempDot} />
              </g>
            )}
            {showPoints && sorted.map((p, i) => (
              <circle key={i} cx={tempToX(p.temp)} cy={speedToY(p.speed)} r={editable ? 7 : 6} className={styles.curvePoint}
                style={editable ? { cursor: 'grab' } : undefined}
                onPointerDown={editable ? (e) => onHandleDown(i, e) : undefined}
                onPointerMove={editable ? onHandleMove : undefined}
                onPointerUp={editable ? onHandleUp : undefined}
                onPointerEnter={editable ? () => setHoverIdx(i) : undefined}
                onPointerLeave={editable ? () => setHoverIdx(null) : undefined}
                onContextMenu={editable ? (e) => onRemovePoint(i, e) : undefined} />
            ))}
          </svg>
          {readoutPt && (
            <ChartHoverTooltip ref={tooltipRef}>
              <ChartTooltipRow color="var(--accent)" name={xName}>
                <ChartTooltipVal>{axis?.formatX ? formatX(readoutPt.temp) : t('cooling.curve.tempBadge', { temp: localizeNumbers(readoutPt.temp.toFixed(0), numberFormat) })}</ChartTooltipVal>
              </ChartTooltipRow>
              <ChartTooltipRow color="var(--accent-glow)" name={yName}>
                <ChartTooltipVal>{localizeNumbers(`${readoutPt.speed.toFixed(0)}%`, numberFormat)}</ChartTooltipVal>
              </ChartTooltipRow>
            </ChartHoverTooltip>
          )}
          </div>
          <div className={styles.curveXAxis} aria-hidden="true">
            {/* Inner track is inset 8px left/right to match SVG PAD.left / PAD.right
                so labels line up 1:1 with the vertical grid lines. */}
            <div className={styles.curveXAxisInner}>
              {vLines.map(v => (
                <span key={v} className={styles.curveAxisLabel}
                  style={{ left: `${((v - tempMin) / (tempMax - tempMin)) * 100}%` }}>
                  {formatX(v)}
                </span>
              ))}
              {hasDot && (
                <span className={styles.curveAxisLiveX} style={{ left: `${dotLeftPct}%` }}>
                  {formatLiveX(currentTemp!)}
                </span>
              )}
            </div>
          </div>
        </div>
        {/* Duty legend + live readout sit to the RIGHT of the chart so the
            right-edge guide line points straight at the live value. */}
        <div className={styles.curveYAxis} aria-hidden="true" style={{ height }}>
          {[...H_LINES].reverse().map(s => (
            <span key={s} className={styles.curveAxisLabel}>{s}%</span>
          ))}
          {hasDot && (
            <span className={styles.curveAxisLiveY} style={{ top: `${dotY}px` }}>
              {localizeNumbers(`${dotSpeed.toFixed(0)}%`, numberFormat)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Mix controls ───────────────────────────────────────────────────────────

function MixControls({ curve, allCurves, sources, channels, onChange }: {
  curve: CurveDef;
  allCurves: CurveDef[];
  sources: TemperatureSource[];
  channels: FanChannel[];
  onChange: (c: CurveDef) => void;
}) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const otherCurves = useMemo(() => allCurves.filter(c => c.id !== curve.id && c.type !== 'mix'), [allCurves, curve.id]);
  const toggleId = (id: string) => {
    const ids = curve.mix.curveIds.includes(id)
      ? curve.mix.curveIds.filter(x => x !== id)
      : [...curve.mix.curveIds, id];
    onChange({ ...curve, mix: { ...curve.mix, curveIds: ids } });
  };
  const curveSpeedMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of otherCurves) m.set(c.id, computeCurveSpeed(c, sources, allCurves, new Set(), channels));
    return m;
  }, [otherCurves, sources, allCurves, channels]);
  return (
    <div className={styles.mixControls}>
      <span className={styles.mixSectionLabel}>
        {t('cooling.curve.mix.fn')}
        <InfoTooltip message={t('cooling.curve.mix.fn.help')} side="top" />
      </span>
      <div className="chip-group">
        {MIX_FNS.map(fn => (
          <button key={fn.key} type="button"
            className={`chip-action${fn.key === curve.mix.fn ? ' chip-active' : ''}`}
            onClick={() => onChange({ ...curve, mix: { ...curve.mix, fn: fn.key } })}>{t(fn.labelKey)}</button>
        ))}
      </div>
      <div className={styles.mixSections}>
        <span className={styles.mixSectionLabel}>{t('cooling.curve.mix.sources')}</span>
        <div className={styles.mixSources}>
          {otherCurves.map(c => {
            const selected = curve.mix.curveIds.includes(c.id);
            return (
              <div key={c.id} className={styles.mixSourceRow}>
                <span className={styles.mixSourceName}>{c.name}</span>
                <span className={styles.mixSourceValue}>{localizeNumbers(`${(curveSpeedMap.get(c.id) ?? 0).toFixed(0)}%`, numberFormat)}</span>
                <button type="button"
                  className={`${styles.switch}${selected ? ' ' + styles.switchOn : ''}`}
                  onClick={() => toggleId(c.id)}
                  aria-pressed={selected}
                  aria-label={c.name}>
                  <span className={styles.switchThumb} />
                </button>
              </div>
            );
          })}
          {otherCurves.length === 0 && <span className={styles.textDim}>{t('cooling.curve.mix.noCurves')}</span>}
        </div>
      </div>
    </div>
  );
}

// ── Curve Card ─────────────────────────────────────────────────────────────

export const CurveCard = memo(function CurveCard({
  curve, allCurves, sources, channels = [], syncExcludedIds = [], children,
  onChange, onDelete, onResetPreset,
}: {
  curve: CurveDef;
  allCurves: CurveDef[];
  sources: TemperatureSource[];
  /** Fan channels a Sync curve may follow. */
  channels?: FanChannel[];
  /** Fans this curve already drives: offered but not selectable, since a curve
   *  following its own output would chase itself. Listing them greyed beats
   *  hiding them - a curve that drives every fan would otherwise show an empty
   *  picker with no hint why. */
  syncExcludedIds?: string[];
  /** The curve-selector buttons, rendered inside the card under the graph. */
  children?: ReactNode;
  onChange: (c: CurveDef) => void;
  onDelete: () => void;
  /** Reset a preset curve (silent/balanced/turbo/max) back to its defaults. Only
   *  rendered when curve.preset is set; gated by isModeCurveDirty. */
  onResetPreset?: () => void;
}) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const set = (partial: Partial<CurveDef>) => onChange({ ...curve, ...partial });

  const excludedSyncIds = useMemo(() => new Set(syncExcludedIds), [syncExcludedIds]);

  // A Sync curve with no fan selected evaluates to nothing, so the fans bound
  // to it would silently hold their last duty. Picking the mode picks the first
  // fan it is allowed to follow.
  const pickType = (type: CurveType): Partial<CurveDef> => {
    if (type !== 'sync' || curve.sync.sourceChannelId) return { type };
    const first = channels.find(c => !excludedSyncIds.has(c.id));
    return first ? { type, sync: { ...curve.sync, sourceChannelId: first.id } } : { type };
  };
  const isPreset = !!curve.preset;
  const [renaming, setRenaming] = useState(false);

  // Hand-rolled rather than ChipGroup: each chip carries its own hover tooltip
  // describing the mode. Styling comes from the shared .chip-action classes.
  const typeChips = (
    <div className={`chip-group ${styles.curveTypeChipGroup}`} role="radiogroup" aria-label={t('cooling.curve.type.label')}>
      {CURVE_TYPES.map(ct => {
        const selected = ct.key === curve.type;
        const label = t(ct.labelKey);
        return (
          <HoverTooltip key={ct.key} title={label} body={t(ct.hintKey)} side="bottom">
            <button type="button" role="radio"
              className={`chip-action${selected ? ' chip-active' : ''}`}
              onClick={() => set(pickType(ct.key))}
              aria-label={label} aria-checked={selected}>
              {ct.icon}
              <span className={styles.curveTypeChipLabel}>{label}</span>
            </button>
          </HoverTooltip>
        );
      })}
    </div>
  );

  const sourceRow = (curve.type !== 'mix' && curve.type !== 'flat' && curve.type !== 'sync') ? (
    <label className={styles.sourceRow}>
      <span className={styles.controlLabel}>
        {t('cooling.curve.source')}
        <InfoTooltip message={t('cooling.curve.source.help')} side="top" />
      </span>
      <Select className={styles.sourceSelect} value={curve.sourceId}
        onChange={v => set({ sourceId: v })} ariaLabel={t('cooling.curve.source')}>
        {sources.map(s => (<option key={s.id} value={s.id}>{s.category} - {s.name} ({localizeNumbers(s.value.toFixed(1), numberFormat)}°C)</option>))}
      </Select>
    </label>
  ) : null;

  const footer = (
    <>
      <div className={styles.curveCardFooterActions}>
        {/* Rename applies to every curve - presets included; only delete is blocked. */}
        <HoverTooltip body={t('cooling.curves.rename')} side="top">
          <Button type="button" size="sm" tone="neutral" icon={<Pencil size={12} aria-hidden />}
            onClick={e => { e.stopPropagation(); setRenaming(true); }}>
            {t('cooling.curves.renameBtn')}
          </Button>
        </HoverTooltip>
        {isPreset && onResetPreset && (
          <HoverTooltip body={t('cooling.curves.resetToDefaults')} side="top">
            <Button type="button" size="sm" tone="neutral" icon={<RotateCcw size={12} aria-hidden />}
              onClick={e => { e.stopPropagation(); onResetPreset(); }} disabled={!isModeCurveDirty(curve)}>
              {t('cooling.curves.resetBtn')}
            </Button>
          </HoverTooltip>
        )}
        {/* Preset curves (Silent/Balanced/Turbo) are permanent - no Remove. */}
        {!isPreset && (
          <HoverTooltip body={t('cooling.curves.delete')} side="top">
            <Button type="button" size="sm" tone="danger" icon={<Trash2 size={12} aria-hidden />}
              onClick={e => { e.stopPropagation(); onDelete(); }}>
              {t('cooling.curves.removeBtn')}
            </Button>
          </HoverTooltip>
        )}
      </div>
      <PromptModal
        open={renaming}
        title={t('cooling.curves.renameTitle')}
        initialValue={curve.name}
        maxLength={20}
        onConfirm={name => { set({ name }); setRenaming(false); }}
        onCancel={() => setRenaming(false)}
      />
    </>
  );

  const flatSlider = (
    <Slider orientation="stacked" editable label={t('cooling.curve.fixed.speed')}
      info={t('cooling.curve.fixed.speed.help')}
      value={curve.flat.speed} min={0} max={100} trackFill formatValue={v => `${v}%`}
      onChange={v => set({ flat: { speed: v } })} />
  );
  const linearBlock = (
    <div className={styles.linearControls}>
      <RangeSlider orientation="stacked" editable label={t('cooling.curve.linear.temp')}
        info={t('cooling.curve.linear.temp.help')}
        value={[curve.linear.minTemp, curve.linear.maxTemp]} min={20} max={100} formatValue={v => `${v}°`}
        onChange={([minTemp, maxTemp]) => set({ linear: { ...curve.linear, minTemp, maxTemp } })} />
      <RangeSlider orientation="stacked" editable label={t('cooling.curve.linear.speed')}
        info={t('cooling.curve.linear.speed.help')}
        value={[curve.linear.minSpeed, curve.linear.maxSpeed]} min={0} max={100} formatValue={v => `${v}%`}
        onChange={([minSpeed, maxSpeed]) => set({ linear: { ...curve.linear, minSpeed, maxSpeed } })} />
      <ResponseTimeSlider value={curve.linear.responseTime}
        onChange={v => set({ linear: { ...curve.linear, responseTime: v } })} />
    </div>
  );
  const multipointResponse = (
    <ResponseTimeSlider value={curve.multipoint.responseTime}
      onChange={v => set({ multipoint: { ...curve.multipoint, responseTime: v } })} />
  );
  const mixBlock = (
    <>
      <MixControls curve={curve} allCurves={allCurves} sources={sources} channels={channels} onChange={onChange} />
      <ResponseTimeSlider value={curve.mix.responseTime}
        onChange={v => set({ mix: { ...curve.mix, responseTime: v } })} />
    </>
  );

  const triggerBlock = (
    <div className={styles.linearControls}>
      <RangeSlider orientation="stacked" editable label={t('cooling.curve.trigger.temp')}
        info={t('cooling.curve.trigger.temp.help')}
        value={[curve.trigger.idleTemp, curve.trigger.loadTemp]} min={20} max={100} formatValue={v => `${v}°`}
        onChange={([idleTemp, loadTemp]) => set({ trigger: { ...curve.trigger, idleTemp, loadTemp } })} />
      <RangeSlider orientation="stacked" editable label={t('cooling.curve.trigger.speed')}
        info={t('cooling.curve.trigger.speed.help')}
        value={[curve.trigger.idleSpeed, curve.trigger.loadSpeed]} min={0} max={100} formatValue={v => `${v}%`}
        onChange={([idleSpeed, loadSpeed]) => set({ trigger: { ...curve.trigger, idleSpeed, loadSpeed } })} />
      <ResponseTimeSlider value={curve.trigger.responseTime}
        onChange={v => set({ trigger: { ...curve.trigger, responseTime: v } })} />
    </div>
  );

  const autoBlock = (
    <div className={styles.linearControls}>
      <RangeSlider orientation="stacked" editable label={t('cooling.curve.auto.temp')}
        info={t('cooling.curve.auto.temp.help')}
        value={[curve.auto.idleTemp, curve.auto.loadTemp]} min={20} max={100} formatValue={v => `${v}°`}
        onChange={([idleTemp, loadTemp]) => set({ auto: { ...curve.auto, idleTemp, loadTemp } })} />
      <RangeSlider orientation="stacked" editable label={t('cooling.curve.auto.speed')}
        info={t('cooling.curve.auto.speed.help')}
        value={[curve.auto.minSpeed, curve.auto.maxSpeed]} min={0} max={100} formatValue={v => `${v}%`}
        onChange={([minSpeed, maxSpeed]) => set({ auto: { ...curve.auto, minSpeed, maxSpeed } })} />
      <Slider orientation="stacked" editable label={t('cooling.curve.auto.step')}
        info={t('cooling.curve.auto.step.help')}
        value={curve.auto.step} min={1} max={20} step={1} trackFill formatValue={v => `${v}%`}
        onChange={v => set({ auto: { ...curve.auto, step: v } })} />
      <Slider orientation="stacked" editable label={t('cooling.curve.auto.deadband')}
        info={t('cooling.curve.auto.deadband.help')}
        value={curve.auto.deadband} min={0} max={10} step={1} trackFill formatValue={v => `${v}°`}
        onChange={v => set({ auto: { ...curve.auto, deadband: v } })} />
      <ResponseTimeSlider value={curve.auto.responseTime}
        onChange={v => set({ auto: { ...curve.auto, responseTime: v } })} />
    </div>
  );

  const syncBlock = (
    <div className={styles.linearControls}>
      <label className={styles.sourceRow}>
        <span className={styles.controlLabel}>
          {t('cooling.curve.sync.source')}
          <InfoTooltip message={t('cooling.curve.sync.source.help')} side="top" />
        </span>
        <Select className={styles.sourceSelect} value={curve.sync.sourceChannelId}
          onChange={v => set({ sync: { ...curve.sync, sourceChannelId: v } })}
          ariaLabel={t('cooling.curve.sync.source')}>
          {channels.map(c => (
            <option key={c.id} value={c.id} disabled={excludedSyncIds.has(c.id)}>
              {excludedSyncIds.has(c.id)
                ? t('cooling.curve.sync.drivenByThis', { name: c.name })
                : `${c.name} (${localizeNumbers(`${c.dutyPercent ?? 0}%`, numberFormat)})`}
            </option>
          ))}
        </Select>
      </label>
      <div className="chip-group">
        {SYNC_MODES.map(m => (
          <button key={String(m.proportional)} type="button"
            className={`chip-action${m.proportional === curve.sync.proportional ? ' chip-active' : ''}`}
            onClick={() => set({ sync: { ...curve.sync, proportional: m.proportional } })}>
            {t(m.labelKey)}
          </button>
        ))}
      </div>
      <Slider orientation="stacked" editable label={t('cooling.curve.sync.offset')}
        info={t('cooling.curve.sync.offset.help')}
        value={curve.sync.offset} min={-50} max={50} step={1} trackFill
        formatValue={v => (curve.sync.proportional ? `${v > 0 ? '+' : ''}${v}%` : `${v > 0 ? '+' : ''}${v}`)}
        onChange={v => set({ sync: { ...curve.sync, offset: v } })} />
    </div>
  );

  // The curve's source temperature, used to place the on-graph dot. Fixed, Mix
  // and Sync have no single source, so no dot (the line stands alone).
  const dotTemp = curve.type === 'flat' || curve.type === 'mix' || curve.type === 'sync'
    ? undefined
    : sources.find(s => s.id === curve.sourceId)?.value;

  const isMp = curve.type === 'multipoint';
  const editControls =
    curve.type === 'flat' ? flatSlider :
    curve.type === 'linear' ? linearBlock :
    curve.type === 'multipoint' ? multipointResponse :
    curve.type === 'trigger' ? triggerBlock :
    curve.type === 'auto' ? autoBlock :
    curve.type === 'sync' ? syncBlock :
    mixBlock;
  return (
    <div className={styles.curveCard}>
      {/* Graph always on top. Live duty/temp read out on the axes. */}
      <div className={styles.heroGraph}>
        <CurveGraph
          points={isMp ? curve.multipoint.points : sampleCurveShape(curve, allCurves, sources, channels)}
          showPoints={isMp}
          editable={isMp}
          height={PINNED_GRAPH_H}
          currentTemp={dotTemp}
          onChange={isMp ? pts => set({ multipoint: { ...curve.multipoint, points: pts } }) : undefined}
        />
      </div>
      {/* Curve selector (with its own header) sits under the graph. */}
      {children}
      {/* Then the selected curve's options, stacked. */}
      <div className={styles.heroOptions}>
        <span className={styles.curveFieldHeader}>{t('cooling.curve.type.label')}</span>
        {typeChips}
        {sourceRow}
        {editControls}
        {footer}
      </div>
    </div>
  );
});
