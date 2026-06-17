import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '../../../../components/common/Button/Button';
import { Minus, TrendingUp, Activity, Combine, Trash2, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import type { CurvePoint, TemperatureSource } from '../../../../api/cooling';
import { useTranslation } from '../../../../lib/i18n';
import type { CurveDef, CurveType, MixFn } from '../../../../types/cooling';
import { EditableText } from '../../../../components/common/Editable/EditableText';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import { Slider } from '../../../../components/common/Slider/Slider';
import { RangeSlider } from '../../../../components/common/Slider/RangeSlider';
import { Select } from '../../../../components/common/Select/Select';
import { presetIconFor, isPresetCurveDirty } from './coolingPresets';
import styles from '../CoolingPage.module.scss';

const CURVE_TYPES: { key: CurveType; labelKey: string; hintKey: string; icon: ReactNode }[] = [
  { key: 'flat', labelKey: 'cooling.curve.type.fixed', hintKey: 'cooling.curve.fixed.hint', icon: <Minus size={14} /> },
  { key: 'linear', labelKey: 'cooling.curve.type.linear', hintKey: 'cooling.curve.linear.hint', icon: <TrendingUp size={14} /> },
  { key: 'multipoint', labelKey: 'cooling.curve.type.custom', hintKey: 'cooling.curve.graph.hint', icon: <Activity size={14} /> },
  { key: 'mix', labelKey: 'cooling.curve.type.mix', hintKey: 'cooling.curve.mix.hint', icon: <Combine size={14} /> },
];

// Sum is intentionally omitted from the UI -- the backend still honors it for
// any existing saved curves, but we don't offer it as a selectable option.
const MIX_FNS: { key: MixFn; labelKey: string }[] = [
  { key: 'min', labelKey: 'cooling.curve.mix.fn.min' },
  { key: 'max', labelKey: 'cooling.curve.mix.fn.max' },
  { key: 'avg', labelKey: 'cooling.curve.mix.fn.avg' },
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
      .map(c => computeCurveSpeed(c, sources, allCurves, seen));
    if (inputs.length === 0) return 0;
    if (curve.mix.fn === 'min') return Math.min(...inputs);
    if (curve.mix.fn === 'max') return Math.max(...inputs);
    if (curve.mix.fn === 'avg') return inputs.reduce((a, b) => a + b, 0) / inputs.length;
    if (curve.mix.fn === 'sum') return Math.min(100, inputs.reduce((a, b) => a + b, 0));
  }
  return 0;
}

// ── Response time helper ──────────────────────────────────────────────────
// Wraps the canonical Slider with the seconds formatter so callers stay terse.
function ResponseTimeSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { t } = useTranslation();
  return (
    <Slider
      // eslint-disable-next-line i18next/no-literal-string -- slider layout enum
      orientation="stacked" editable label={t('cooling.curve.response')} value={value}
      min={0.1} max={5.0} step={0.1} trackFill
      formatValue={v => t('cooling.curve.responseSeconds', { value: v.toFixed(1) })} onChange={onChange} />
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

// Plot a curve's shape across the 20-100°C axis by evaluating it with every
// source swept to the same temperature. Works for every type, including Mix
// (its inputs evaluate at the same swept temperature), giving one line on a
// single axis. Multipoint uses its own draggable points instead.
function sampleCurveShape(curve: CurveDef, allCurves: CurveDef[], sources: TemperatureSource[]): CurvePoint[] {
  const out: CurvePoint[] = [];
  for (let temp = TEMP_MIN; temp <= TEMP_MAX; temp += SAMPLE_STEP) {
    const swept = sources.map(s => ({ ...s, value: temp }));
    out.push({ temp, speed: Math.max(0, Math.min(100, computeCurveSpeed(curve, swept, allCurves))) });
  }
  return out;
}

// `editable` (default true) renders draggable points + click-to-add /
// right-click-to-remove; when false the graph is a static line (Fixed /
// Linear / Mix shapes). `currentTemp` draws a temperature line from the top
// down to a dot on the curve. `height` sizes the SVG + its y-axis gutter
// (CSS default 140).
function CurveGraph({ points, currentTemp, onChange, editable = true, height = GRAPH_H }: {
  points: CurvePoint[];
  currentTemp?: number;
  onChange?: (pts: CurvePoint[]) => void;
  editable?: boolean;
  height?: number;
}) {
  const { t } = useTranslation();
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [width, setWidth] = useState(400);
  const rafWidthRef = useRef(0);

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
  const tempToX = (t: number) => PAD.left + ((t - TEMP_MIN) / (TEMP_MAX - TEMP_MIN)) * chartW;
  const speedToY = (s: number) => PAD.top + chartH - (s / 100) * chartH;
  const xToTemp = (x: number) => Math.round(Math.max(TEMP_MIN, Math.min(TEMP_MAX, TEMP_MIN + ((x - PAD.left) / chartW) * (TEMP_MAX - TEMP_MIN))));
  const yToSpeed = (y: number) => Math.round(Math.max(0, Math.min(100, 100 - ((y - PAD.top) / chartH) * 100)));

  const sorted = useMemo(() => [...points].sort((a, b) => a.temp - b.temp), [points]);
  // Extend the line/area flat to the chart edges (20 / 100) so the curve fills
  // the full width, matching how the engine clamps outside the point range. The
  // draggable circles below still sit only on the real points.
  const edged = useMemo(() => {
    if (sorted.length === 0) return sorted;
    const out = [...sorted];
    if (out[0].temp > TEMP_MIN) out.unshift({ temp: TEMP_MIN, speed: out[0].speed });
    if (out[out.length - 1].temp < TEMP_MAX) out.push({ temp: TEMP_MAX, speed: out[out.length - 1].speed });
    return out;
  }, [sorted]);
  const linePath = edged.map((p, i) => `${i === 0 ? 'M' : 'L'} ${tempToX(p.temp)} ${speedToY(p.speed)}`).join(' ');
  const areaPath = edged.length > 0 ? linePath + ` L ${tempToX(edged[edged.length - 1].temp)} ${speedToY(0)} L ${tempToX(edged[0].temp)} ${speedToY(0)} Z` : '';

  // Piecewise-linear interpolation of the rendered line at an arbitrary temp,
  // for the current-temperature dot.
  const speedAtTemp = (tt: number): number => {
    if (sorted.length === 0) return 0;
    if (tt <= sorted[0].temp) return sorted[0].speed;
    if (tt >= sorted[sorted.length - 1].temp) return sorted[sorted.length - 1].speed;
    for (let i = 0; i < sorted.length - 1; i++) {
      if (tt >= sorted[i].temp && tt <= sorted[i + 1].temp) {
        const f = (tt - sorted[i].temp) / (sorted[i + 1].temp - sorted[i].temp);
        return sorted[i].speed + f * (sorted[i + 1].speed - sorted[i].speed);
      }
    }
    return sorted[sorted.length - 1].speed;
  };

  const onPtrDown = (idx: number, e: React.PointerEvent) => { e.preventDefault(); (e.target as Element).setPointerCapture(e.pointerId); setDragging(idx); };
  const onPtrMove = (e: React.PointerEvent) => {
    if (dragging === null || !svgRef.current || !onChange) return;
    const rect = svgRef.current.getBoundingClientRect();
    let temp = xToTemp(e.clientX - rect.left); const speed = yToSpeed(e.clientY - rect.top);
    const prev = dragging > 0 ? sorted[dragging - 1].temp + 1 : TEMP_MIN;
    const next = dragging < sorted.length - 1 ? sorted[dragging + 1].temp - 1 : TEMP_MAX;
    temp = Math.max(prev, Math.min(next, temp));
    const n = [...sorted]; n[dragging] = { temp, speed }; onChange(n);
  };
  const onDblClick = (e: React.MouseEvent) => {
    if (!svgRef.current || !onChange) return; const rect = svgRef.current.getBoundingClientRect();
    onChange([...sorted, { temp: xToTemp(e.clientX - rect.left), speed: yToSpeed(e.clientY - rect.top) }].sort((a, b) => a.temp - b.temp));
  };
  const onCtxMenu = (idx: number, e: React.MouseEvent) => { e.preventDefault(); if (onChange && sorted.length > 2) onChange(sorted.filter((_, i) => i !== idx)); };

  return (
    <div className={styles.curveGraphWrap}>
      <div className={styles.curveGraphFrame}>
        {/* Y-axis labels sit in their own gutter to the left of the SVG so
            they can never clip into the curve. */}
        <div className={styles.curveYAxis} aria-hidden="true" style={{ height }}>
          {[...H_LINES].reverse().map(s => (
            <span key={s} className={styles.curveAxisLabel}>{s}%</span>
          ))}
          <span className={styles.curveAxisTitle}>{t('cooling.curve.axisDuty')}</span>
        </div>
        <div className={styles.curveChartArea}>
          <svg ref={svgRef} className={styles.curveGraph} style={{ height }} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none"
            onPointerMove={editable ? onPtrMove : undefined} onPointerUp={editable ? () => setDragging(null) : undefined} onDoubleClick={editable ? onDblClick : undefined}>
            {H_LINES.map(s => (<g key={`h${s}`}><line x1={PAD.left} y1={speedToY(s)} x2={width - PAD.right} y2={speedToY(s)} className={styles.gridLine} /></g>))}
            {V_LINES.map(v => (<g key={`v${v}`}><line x1={tempToX(v)} y1={PAD.top} x2={tempToX(v)} y2={height - PAD.bottom} className={styles.gridLine} /></g>))}
        <defs><linearGradient id="curveGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" /><stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" /></linearGradient></defs>
        {areaPath && <path d={areaPath} fill="url(#curveGrad)" />}
        <path d={linePath} fill="none" stroke="var(--accent-glow)" strokeWidth="2.5" />
        {typeof currentTemp === 'number' && currentTemp >= TEMP_MIN && currentTemp <= TEMP_MAX && (() => {
          const tx = tempToX(currentTemp);
          const cy = speedToY(speedAtTemp(currentTemp));
          // Drop the temp line from just under its badge down to the dot.
          const lineTop = PAD.top + 12;
          return (
            <g className={styles.curveTempIndicator}>
              {cy > lineTop && (
                <line x1={tx} y1={lineTop} x2={tx} y2={cy} className={styles.tempLine} />
              )}
              <rect x={tx - 22} y={PAD.top - 2} width="44" height="14" rx="2" className={styles.tempBadge} />
              <text x={tx} y={PAD.top + 8} className={styles.tempBadgeText} textAnchor="middle">
                {t('cooling.curve.tempBadge', { temp: currentTemp.toFixed(1) })}
              </text>
              <circle cx={tx} cy={cy} r={4} className={styles.tempDot} />
            </g>
          );
        })()}
        {editable && sorted.map((p, i) => (
          <circle key={i} cx={tempToX(p.temp)} cy={speedToY(p.speed)} r={dragging === i ? 8 : 6}
            className={`${styles.curvePoint} ${dragging === i ? styles.curvePointActive : ''}`}
            onPointerDown={e => onPtrDown(i, e)} onContextMenu={e => onCtxMenu(i, e)} />
        ))}
          </svg>
          <div className={styles.curveXAxis} aria-hidden="true">
            <span className={styles.curveAxisTitleX}>{t('cooling.curve.axisTemp')}</span>
            {/* Inner track is inset 8px left/right to match SVG PAD.left / PAD.right
                so labels line up 1:1 with the vertical grid lines. */}
            <div className={styles.curveXAxisInner}>
              {V_LINES.map(v => (
                <span key={v} className={styles.curveAxisLabel}
                  style={{ left: `${((v - TEMP_MIN) / (TEMP_MAX - TEMP_MIN)) * 100}%` }}>
                  {v}°
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Mix controls ───────────────────────────────────────────────────────────

function MixControls({ curve, allCurves, sources, onChange }: {
  curve: CurveDef;
  allCurves: CurveDef[];
  sources: TemperatureSource[];
  onChange: (c: CurveDef) => void;
}) {
  const { t } = useTranslation();
  const otherCurves = useMemo(() => allCurves.filter(c => c.id !== curve.id && c.type !== 'mix'), [allCurves, curve.id]);
  const toggleId = (id: string) => {
    const ids = curve.mix.curveIds.includes(id)
      ? curve.mix.curveIds.filter(x => x !== id)
      : [...curve.mix.curveIds, id];
    onChange({ ...curve, mix: { ...curve.mix, curveIds: ids } });
  };
  const curveSpeedMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of otherCurves) m.set(c.id, computeCurveSpeed(c, sources, allCurves));
    return m;
  }, [otherCurves, sources, allCurves]);
  return (
    <div className={styles.mixControls}>
      <span className={styles.mixSectionLabel}>{t('cooling.curve.mix.fn')}</span>
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
                <span className={styles.mixSourceValue}>{(curveSpeedMap.get(c.id) ?? 0).toFixed(0)}%</span>
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

export interface CurveCardDrag {
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: () => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

export const CurveCard = memo(function CurveCard({
  curve, allCurves, sources, inUse, expanded, highlighted, outputPercent, pinned, children,
  onChange, onDelete, onResetPreset, onExpand, onCollapse, onHover,
  nubRef, cardRef: cardRefProp, onWirePointerDown, drag,
}: {
  curve: CurveDef;
  allCurves: CurveDef[];
  sources: TemperatureSource[];
  inUse: boolean;
  /** Collapsible card: when true the per-type editor body is shown. Ignored
   *  in pinned mode (the hero card is always open). */
  expanded: boolean;
  /** Visual emphasis - this curve is on the currently-hovered or expanded
   *  wire path. */
  highlighted?: boolean;
  /** Live computed output (0-100), shown as a chip. Computed once upstream so
   *  the recursion-safe Mix path is shared. */
  outputPercent?: number;
  /** Hero mode for the desktop cooling page: a fixed-size, full-width card
   *  with the options on the left and the graph on the right; the output % is
   *  overlaid on the graph; `children` (the curve-selector buttons) render
   *  inside the card. No chevron / drag / wire. */
  pinned?: boolean;
  /** Pinned hero only: the curve-selector buttons, rendered inside the card. */
  children?: ReactNode;
  onChange: (c: CurveDef) => void;
  onDelete: () => void;
  /** Reset a preset curve (silent/balanced/turbo) back to its defaults. Only
   *  rendered when curve.preset is set; gated by isPresetCurveDirty. */
  onResetPreset?: () => void;
  /** Click on the card body requests expand. Unused in pinned mode. */
  onExpand?: () => void;
  /** Chevron click while expanded collapses this card. Unused in pinned mode. */
  onCollapse?: () => void;
  /** Hover in/out broadcasts for the wire-highlight pass. Unused in pinned mode. */
  onHover?: (id: string | null) => void;
  /** Ref handed to the output nub so the wire SVG can read its bbox. */
  nubRef?: (el: HTMLDivElement | null) => void;
  /** Ref handed to the card root so the wire DnD hit-test can treat the
   *  whole card as a drop target (not just the nub). */
  cardRef?: (el: HTMLDivElement | null) => void;
  /** Pointer-down on the output nub starts a wire drag. */
  onWirePointerDown?: (e: React.PointerEvent) => void;
  drag?: CurveCardDrag;
}) {
  const { t } = useTranslation();
  const set = (partial: Partial<CurveDef>) => onChange({ ...curve, ...partial });
  const PresetIcon = presetIconFor(curve.preset);
  const isPreset = !!curve.preset;
  const output = outputPercent ?? 0;

  // Called unconditionally (hooks rule); only used by the non-pinned card.
  const cardRef = useRef<HTMLDivElement>(null);
  const setCardEl = (el: HTMLDivElement | null) => {
    cardRef.current = el;
    cardRefProp?.(el);
  };

  // ── Shared sub-renders (placed differently in the two layouts) ────────────
  const nameEl = isPreset ? (
    <>
      {PresetIcon && (
        <HoverTooltip body={t('cooling.curve.presetLockedTooltip')} side="bottom">
          <span className={styles.presetGlyph} aria-hidden="true">{ }<PresetIcon size={14} /></span>
        </HoverTooltip>
      )}
      <HoverTooltip body={t('cooling.curve.presetLockedTooltip')} side="bottom">
        <span className={styles.presetName}>{curve.name}</span>
      </HoverTooltip>
    </>
  ) : (
    <EditableText value={curve.name} onCommit={name => set({ name })} className={styles.editableName} />
  );

  // Type chips. `showLabels` adds the text label beside the icon (the pinned
  // hero card); the immersive list stays icon-only. The selected chip uses the
  // soft-active treatment (accent border/text + faint accent bg), not a fill.
  const renderTypeChips = (showLabels: boolean) => (
    <div className={`chip-group ${styles.curveTypeChipGroup}`} role="radiogroup" aria-label={t('cooling.curve.type.label')}>
      {CURVE_TYPES.map(ct => {
        const selected = ct.key === curve.type;
        const label = t(ct.labelKey);
        return (
          <HoverTooltip key={ct.key} title={label} body={t(ct.hintKey)} side="bottom">
            <button type="button" role="radio"
              className={`chip-action${selected ? ' ' + styles.chipSoftActive : ''}`}
              onClick={() => set({ type: ct.key })}
              aria-label={label} aria-checked={selected}>
              {ct.icon}
              {showLabels && <span className={styles.curveTypeChipLabel}>{label}</span>}
            </button>
          </HoverTooltip>
        );
      })}
    </div>
  );

  const sourceRow = (curve.type !== 'mix' && curve.type !== 'flat') ? (
    <label className={styles.sourceRow}>
      <span className={styles.controlLabel}>{t('cooling.curve.source')}</span>
      <Select className={styles.sourceSelect} variant="ghost" value={curve.sourceId}
        onChange={v => set({ sourceId: v })} ariaLabel={t('cooling.curve.source')}>
        {sources.map(s => (<option key={s.id} value={s.id}>{s.category} - {s.name} ({s.value.toFixed(1)}°C)</option>))}
      </Select>
    </label>
  ) : null;

  const footer = (
    <div className={styles.curveCardFooterActions}>
      {isPreset && onResetPreset && (
        <HoverTooltip body={t('cooling.curves.resetToDefaults')} side="top">
          <Button type="button" size="sm" tone="neutral" icon={<RotateCcw size={12} aria-hidden />}
            onClick={e => { e.stopPropagation(); onResetPreset(); }} disabled={!isPresetCurveDirty(curve)}>
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
  );

  const flatSlider = (
    <Slider orientation="stacked" editable label={t('cooling.curve.fixed.speed')}
      value={curve.flat.speed} min={0} max={100} trackFill formatValue={v => `${v}%`}
      onChange={v => set({ flat: { speed: v } })} />
  );
  const linearBlock = (
    <div className={styles.linearControls}>
      <RangeSlider orientation="stacked" editable label={t('cooling.curve.linear.temp')}
        value={[curve.linear.minTemp, curve.linear.maxTemp]} min={20} max={100} formatValue={v => `${v}°`}
        onChange={([minTemp, maxTemp]) => set({ linear: { ...curve.linear, minTemp, maxTemp } })} />
      <RangeSlider orientation="stacked" editable label={t('cooling.curve.linear.speed')}
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
      <MixControls curve={curve} allCurves={allCurves} sources={sources} onChange={onChange} />
      <ResponseTimeSlider value={curve.mix.responseTime}
        onChange={v => set({ mix: { ...curve.mix, responseTime: v } })} />
    </>
  );

  // The curve's source temperature, used to place the on-graph dot. Fixed and
  // Mix have no single source, so no dot (the line + output chip stand alone).
  const dotTemp = curve.type === 'flat' || curve.type === 'mix'
    ? undefined
    : sources.find(s => s.id === curve.sourceId)?.value;

  if (pinned) {
    const isMp = curve.type === 'multipoint';
    const editControls =
      curve.type === 'flat' ? flatSlider :
      curve.type === 'linear' ? linearBlock :
      curve.type === 'multipoint' ? multipointResponse :
      mixBlock;
    return (
      <div className={`${styles.curveCard} ${styles.curveCardPinned}`}>
        {/* Graph always on top. */}
        <div className={styles.heroGraph}>
          <CurveGraph
            points={isMp ? curve.multipoint.points : sampleCurveShape(curve, allCurves, sources)}
            editable={isMp}
            height={PINNED_GRAPH_H}
            currentTemp={dotTemp}
            onChange={isMp ? pts => set({ multipoint: { ...curve.multipoint, points: pts } }) : undefined}
          />
          <span className={styles.heroOutBadge} aria-label={`${t('cooling.curve.output')} ${output.toFixed(0)}%`}>
            {output.toFixed(0)}%
          </span>
        </div>
        {/* Curve selector (with its own header) sits under the graph. */}
        {children}
        {/* Then the selected curve's options, stacked. */}
        <div className={styles.heroOptions}>
          <span className={styles.curveFieldHeader}>{t('cooling.curve.type.label')}</span>
          {renderTypeChips(true)}
          {sourceRow}
          {editControls}
          {footer}
        </div>
      </div>
    );
  }

  // ── Non-pinned (collapsible) card — used by the immersive editor ───────────
  const dragEnabled = !!drag;
  const dragClasses = [
    drag?.isDragging ? styles.curveCardDragging : '',
    drag?.isDragOver ? styles.curveCardDragOver : '',
    expanded ? styles.curveCardExpanded : styles.curveCardCollapsed,
    highlighted ? styles.curveCardHighlighted : '',
  ].filter(Boolean).join(' ');
  const interactiveSelector =
    'input, select, textarea, button, svg, label, ' +
    '[role="button"], [role="slider"], [role="switch"], ' +
    `.${styles.editableName}, .${styles.curveGraph}, .${styles.curveTypeChipGroup}, .${styles.curveOutNub}`;

  return (
    <div
      ref={setCardEl}
      className={`${styles.curveCard} ${inUse ? styles.curveCardInUse : ''} ${dragClasses}`}
      draggable={dragEnabled}
      onMouseDownCapture={dragEnabled ? (e) => {
        const target = e.target as HTMLElement;
        const interactive = !!target.closest(interactiveSelector);
        if (cardRef.current) cardRef.current.draggable = !interactive;
      } : undefined}
      onDragStart={dragEnabled ? (e) => {
        const target = e.target as HTMLElement;
        if (target.closest(interactiveSelector)) { e.preventDefault(); return; }
        drag!.onDragStart();
      } : undefined}
      onDragOver={dragEnabled ? (e) => { e.preventDefault(); drag!.onDragOver(); } : undefined}
      onDragLeave={dragEnabled ? drag!.onDragLeave : undefined}
      onDrop={dragEnabled ? drag!.onDrop : undefined}
      onDragEnd={dragEnabled ? drag!.onDragEnd : undefined}
      onClick={() => { if (!expanded) onExpand?.(); }}
      onMouseEnter={() => onHover?.(curve.id)}
      onMouseLeave={() => onHover?.(null)}
    >
      <div className={styles.curveCardHeader}>
        <div className={styles.curveCardTitle}>{nameEl}</div>
        <div className={styles.curveCardModeArea}>
          {renderTypeChips(false)}
          <HoverTooltip body={t('cooling.curve.output')} side="top">
            <span className={styles.curveOutBadge} aria-label={`${t('cooling.curve.output')} ${output.toFixed(0)}%`}>
              {output.toFixed(0)}%
            </span>
          </HoverTooltip>
        </div>
        {onWirePointerDown && (
          <HoverTooltip body={t('cooling.wire.dragHint')} side="top">
            <div ref={nubRef} className={`${styles.curveOutNub}${inUse ? ' ' + styles.nubConnected : ''}`}
              aria-hidden="true" onPointerDown={onWirePointerDown} />
          </HoverTooltip>
        )}
      </div>

      {expanded && (
        <div className={styles.curveCardBody}>
          {sourceRow}
          {curve.type === 'flat' && flatSlider}
          {curve.type === 'linear' && linearBlock}
          {curve.type === 'multipoint' && (
            <>
              <CurveGraph points={curve.multipoint.points} currentTemp={dotTemp}
                onChange={pts => set({ multipoint: { ...curve.multipoint, points: pts } })} />
              {multipointResponse}
            </>
          )}
          {curve.type === 'mix' && mixBlock}
          {footer}
        </div>
      )}

      <HoverTooltip body={expanded ? t('cooling.curves.collapse') : t('cooling.curves.expand')} side="top">
        <button type="button" className={styles.curveCardChevron}
          onClick={e => { e.stopPropagation(); if (expanded) onCollapse?.(); else onExpand?.(); }}
          aria-label={expanded ? t('cooling.curves.collapse') : t('cooling.curves.expand')}>
          {expanded ? <ChevronUp size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}
        </button>
      </HoverTooltip>
    </div>
  );
});
