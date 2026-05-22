import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  { key: 'graph', labelKey: 'cooling.curve.type.custom', hintKey: 'cooling.curve.graph.hint', icon: <Activity size={14} /> },
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
// Linear -> lerp over the min/max temp band; Graph -> piecewise-linear
// interpolation; Mix -> fn applied to the referenced curves' own outputs.
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
  if (curve.type === 'graph') {
    const src = sources.find(s => s.id === curve.sourceId);
    if (!src || curve.graph.points.length === 0) return 0;
    const pts = [...curve.graph.points].sort((a, b) => a.temp - b.temp);
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
// Uses the same stacked + editable layout as the shader effect sliders
// (see AnimateDrawer / storybook "Slider (stacked, editable, zero marker)")
// so cooling controls feel identical to the rest of the settings surface.
function ResponseTimeSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { t } = useTranslation();
  return (
    <Slider orientation="stacked" editable label={t('cooling.curve.response')} value={value}
      min={0.1} max={5.0} step={0.1} trackFill
      formatValue={v => v.toFixed(1) + 's'} onChange={onChange} />
  );
}

// ── SVG Curve Graph ────────────────────────────────────────────────────────

const TEMP_MIN = 20, TEMP_MAX = 100;
// Inner SVG padding reserves space inside the chart frame. Axis labels are
// rendered as HTML (not SVG text) in .curveYAxis / .curveXAxis gutters OUTSIDE
// the SVG, so they can never clip into the chart bars/lines.
const PAD = { left: 8, right: 8, top: 8, bottom: 8 };
const GRAPH_H = 140;
const H_LINES = [0, 25, 50, 75, 100];
const V_LINES: number[] = []; for (let v = 20; v <= 100; v += 10) V_LINES.push(v);

function CurveGraph({ points, currentTemp, onChange }: {
  points: CurvePoint[];
  currentTemp?: number;
  onChange: (pts: CurvePoint[]) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [width, setWidth] = useState(400);
  const rafWidthRef = useRef(0);

  useEffect(() => {
    const el = svgRef.current?.parentElement;
    if (!el) return;
    const w = el.getBoundingClientRect().width;
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

  const chartW = width - PAD.left - PAD.right, chartH = GRAPH_H - PAD.top - PAD.bottom;
  const tempToX = (t: number) => PAD.left + ((t - TEMP_MIN) / (TEMP_MAX - TEMP_MIN)) * chartW;
  const speedToY = (s: number) => PAD.top + chartH - (s / 100) * chartH;
  const xToTemp = (x: number) => Math.round(Math.max(TEMP_MIN, Math.min(TEMP_MAX, TEMP_MIN + ((x - PAD.left) / chartW) * (TEMP_MAX - TEMP_MIN))));
  const yToSpeed = (y: number) => Math.round(Math.max(0, Math.min(100, 100 - ((y - PAD.top) / chartH) * 100)));

  const sorted = useMemo(() => [...points].sort((a, b) => a.temp - b.temp), [points]);
  const linePath = sorted.map((p, i) => `${i === 0 ? 'M' : 'L'} ${tempToX(p.temp)} ${speedToY(p.speed)}`).join(' ');
  const areaPath = sorted.length > 0 ? linePath + ` L ${tempToX(sorted[sorted.length - 1].temp)} ${speedToY(0)} L ${tempToX(sorted[0].temp)} ${speedToY(0)} Z` : '';

  const onPtrDown = (idx: number, e: React.PointerEvent) => { e.preventDefault(); (e.target as Element).setPointerCapture(e.pointerId); setDragging(idx); };
  const onPtrMove = (e: React.PointerEvent) => {
    if (dragging === null || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    let temp = xToTemp(e.clientX - rect.left); const speed = yToSpeed(e.clientY - rect.top);
    const prev = dragging > 0 ? sorted[dragging - 1].temp + 1 : TEMP_MIN;
    const next = dragging < sorted.length - 1 ? sorted[dragging + 1].temp - 1 : TEMP_MAX;
    temp = Math.max(prev, Math.min(next, temp));
    const n = [...sorted]; n[dragging] = { temp, speed }; onChange(n);
  };
  const onDblClick = (e: React.MouseEvent) => {
    if (!svgRef.current) return; const rect = svgRef.current.getBoundingClientRect();
    onChange([...sorted, { temp: xToTemp(e.clientX - rect.left), speed: yToSpeed(e.clientY - rect.top) }].sort((a, b) => a.temp - b.temp));
  };
  const onCtxMenu = (idx: number, e: React.MouseEvent) => { e.preventDefault(); if (sorted.length > 2) onChange(sorted.filter((_, i) => i !== idx)); };

  return (
    <div className={styles.curveGraphWrap}>
      <div className={styles.curveGraphFrame}>
        {/* Y-axis labels sit in their own gutter to the left of the SVG so
            they can never clip into the curve. Top label aligns to 100%,
            bottom to 0%; rows use flex space-between to pin positions. */}
        <div className={styles.curveYAxis} aria-hidden="true">
          {[...H_LINES].reverse().map(s => (
            <span key={s} className={styles.curveAxisLabel}>{s}%</span>
          ))}
        </div>
        <div className={styles.curveChartArea}>
          <svg ref={svgRef} className={styles.curveGraph} viewBox={`0 0 ${width} ${GRAPH_H}`} preserveAspectRatio="none"
            onPointerMove={onPtrMove} onPointerUp={() => setDragging(null)} onDoubleClick={onDblClick}>
            {H_LINES.map(s => (<g key={`h${s}`}><line x1={PAD.left} y1={speedToY(s)} x2={width - PAD.right} y2={speedToY(s)} className={styles.gridLine} /></g>))}
            {V_LINES.map(v => (<g key={`v${v}`}><line x1={tempToX(v)} y1={PAD.top} x2={tempToX(v)} y2={GRAPH_H - PAD.bottom} className={styles.gridLine} /></g>))}
        <defs><linearGradient id="curveGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" /><stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" /></linearGradient></defs>
        {areaPath && <path d={areaPath} fill="url(#curveGrad)" />}
        <path d={linePath} fill="none" stroke="var(--accent-glow)" strokeWidth="2.5" />
        {typeof currentTemp === 'number' && currentTemp >= TEMP_MIN && currentTemp <= TEMP_MAX && (
          <g className={styles.curveTempIndicator}>
            <line x1={tempToX(currentTemp)} y1={PAD.top} x2={tempToX(currentTemp)} y2={GRAPH_H - PAD.bottom}
              className={styles.tempLine} />
            <rect x={tempToX(currentTemp) - 22} y={PAD.top - 2} width="44" height="14" rx="2" className={styles.tempBadge} />
            <text x={tempToX(currentTemp)} y={PAD.top + 8} className={styles.tempBadgeText} textAnchor="middle">
              {currentTemp.toFixed(1)}°C
            </text>
          </g>
        )}
        {sorted.map((p, i) => (
          <circle key={i} cx={tempToX(p.temp)} cy={speedToY(p.speed)} r={dragging === i ? 8 : 6}
            className={`${styles.curvePoint} ${dragging === i ? styles.curvePointActive : ''}`}
            onPointerDown={e => onPtrDown(i, e)} onContextMenu={e => onCtxMenu(i, e)} />
        ))}
          </svg>
          <div className={styles.curveXAxis} aria-hidden="true">
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
      {/* The curve's own output chip lives at the top-right of the card now,
          so this row only carries the function chips. */}
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

// ── Curve Card (collapsible) ───────────────────────────────────────────────

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
  curve, allCurves, sources, inUse, expanded, highlighted, outputPercent,
  onChange, onDelete, onResetPreset, onExpand, onCollapse, onHover,
  nubRef, cardRef: cardRefProp, onWirePointerDown, drag,
}: {
  curve: CurveDef;
  allCurves: CurveDef[];
  sources: TemperatureSource[];
  inUse: boolean;
  /** When true, the card shows the full editor + remove button. When false,
   *  only the title, type chips and output % chip are visible. */
  expanded: boolean;
  /** Visual emphasis - this curve is on the currently-hovered or expanded
   *  wire path. Tracks the same condition as the wire-layer highlight. */
  highlighted?: boolean;
  /** Live computed output (0-100). Computed once in CoolingView so the wire
   *  layer and every card share the same recursion-safe value. */
  outputPercent?: number;
  onChange: (c: CurveDef) => void;
  onDelete: () => void;
  /** Reset a preset curve (silent/balanced/turbo) back to its default
   *  type + linear params. Only rendered when curve.preset is set; gated by
   *  isPresetCurveDirty so the button is disabled when already at defaults. */
  onResetPreset?: () => void;
  /** Click on the card body requests expand. Card body clicks never collapse;
   *  collapse is only via the chevron button or by selecting another curve. */
  onExpand: () => void;
  /** Chevron click while expanded collapses this card. */
  onCollapse: () => void;
  /** Hover in/out broadcasts so the wire layer can highlight this curve's
   *  outgoing wires. Pass null on leave. */
  onHover: (id: string | null) => void;
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

  const dragClasses = [
    drag?.isDragging ? styles.curveCardDragging : '',
    drag?.isDragOver ? styles.curveCardDragOver : '',
    expanded ? styles.curveCardExpanded : styles.curveCardCollapsed,
    highlighted ? styles.curveCardHighlighted : '',
  ].filter(Boolean).join(' ');

  // Selector list for "foreground controls win" gating. Anything matching
  // this blocks card reorder so the child's gesture (slider, chip button,
  // source select, name editor, mix-source toggle, curve graph SVG, wire
  // nub) keeps ownership of the pointer.
  const interactiveSelector =
    'input, select, textarea, button, svg, label, ' +
    '[role="button"], [role="slider"], [role="switch"], ' +
    `.${styles.editableName}, .${styles.curveGraph}, .${styles.curveTypeChipGroup}, .${styles.curveOutNub}`;

  const cardRef = useRef<HTMLDivElement>(null);
  // Bridge the internal ref (used for the draggable toggle below) with the
  // optional prop ref (used by CoolingView to hit-test the whole card as a
  // wire drop target).
  const setCardEl = (el: HTMLDivElement | null) => {
    cardRef.current = el;
    cardRefProp?.(el);
  };

  return (
    <div
      ref={setCardEl}
      className={`${styles.curveCard} ${inUse ? styles.curveCardInUse : ''} ${dragClasses}`}
      draggable={!!drag}
      onMouseDownCapture={drag ? (e) => {
        // Toggle native draggable BEFORE the browser starts its drag
        // tracking. With draggable=false at mousedown time, HTML5 drag
        // never initiates - the slider/native form element keeps the
        // pointer for its own gesture.
        const target = e.target as HTMLElement;
        const interactive = !!target.closest(interactiveSelector);
        if (cardRef.current) {
          cardRef.current.draggable = !interactive;
        }
      } : undefined}
      onDragStart={drag ? (e) => {
        // Belt + suspenders: even if the draggable toggle doesn't catch a
        // particular browser/host, the dragstart gate cancels any drag
        // whose source is inside an interactive child.
        const target = e.target as HTMLElement;
        if (target.closest(interactiveSelector)) {
          e.preventDefault();
          return;
        }
        drag.onDragStart();
      } : undefined}
      onDragOver={drag ? (e) => { e.preventDefault(); drag.onDragOver(); } : undefined}
      onDragLeave={drag ? drag.onDragLeave : undefined}
      onDrop={drag ? drag.onDrop : undefined}
      onDragEnd={drag ? drag.onDragEnd : undefined}
      onClick={() => { if (!expanded) onExpand(); }}
      onMouseEnter={() => onHover(curve.id)}
      onMouseLeave={() => onHover(null)}
    >
      {/* Header is a 2-column row that stays identical across collapsed and
          expanded states: title on the left half, mode selector + active
          mode label + live duty % on the right half (aligned to the left
          edge of the right half). The wire nub straddles the card's outer
          right edge, vertically centered on the header so its position is
          stable regardless of whether the body below is rendered. */}
      <div className={styles.curveCardHeader}>
        <div className={styles.curveCardTitle}>
          {PresetIcon && (
            <HoverTooltip body={t('cooling.curve.presetLockedTooltip')} side="bottom">
              <span className={styles.presetGlyph} aria-hidden="true">
                <PresetIcon size={14} />
              </span>
            </HoverTooltip>
          )}
          {isPreset ? (
            <HoverTooltip body={t('cooling.curve.presetLockedTooltip')} side="bottom">
              <span className={styles.presetName}>{curve.name}</span>
            </HoverTooltip>
          ) : (
            <EditableText value={curve.name} onCommit={name => set({ name })} className={styles.editableName} />
          )}
        </div>

        <div className={styles.curveCardModeArea}>
          <div className={`chip-group ${styles.curveTypeChipGroup}`} role="radiogroup"
            aria-label={t('cooling.curve.type.label')}>
            {CURVE_TYPES.map(ct => {
              const selected = ct.key === curve.type;
              const label = t(ct.labelKey);
              return (
                <HoverTooltip key={ct.key} title={label} body={t(ct.hintKey)} side="bottom">
                  <button type="button" role="radio"
                    className={`chip-action${selected ? ' chip-active' : ''}`}
                    onClick={() => set({ type: ct.key })}
                    aria-label={label}
                    aria-checked={selected}>
                    {ct.icon}
                  </button>
                </HoverTooltip>
              );
            })}
          </div>
          <HoverTooltip body={t('cooling.curve.output')} side="top">
            <span
              className={styles.curveOutBadge}
              aria-label={`${t('cooling.curve.output')} ${output.toFixed(0)}%`}
            >
              {output.toFixed(0)}%
            </span>
          </HoverTooltip>
        </div>

        <HoverTooltip body={t('cooling.wire.dragHint')} side="top">
          <div
            ref={nubRef}
            className={`${styles.curveOutNub}${inUse ? ' ' + styles.nubConnected : ''}`}
            aria-hidden="true"
            onPointerDown={onWirePointerDown}
          />
        </HoverTooltip>
      </div>

      {expanded && (
      <div className={styles.curveCardBody}>
        {curve.type !== 'mix' && curve.type !== 'flat' && (
          <label className={styles.sourceRow}>
            <span className={styles.controlLabel}>{t('cooling.curve.source')}</span>
            <Select
              className={styles.sourceSelect}
              variant="ghost"
              value={curve.sourceId}
              onChange={v => set({ sourceId: v })}
              ariaLabel={t('cooling.curve.source')}
            >
              {sources.map(s => (
                <option key={s.id} value={s.id}>{s.category} - {s.name} ({s.value.toFixed(1)}°C)</option>
              ))}
            </Select>
          </label>
        )}

        {curve.type === 'flat' && (
          <Slider orientation="stacked" editable label={t('cooling.curve.fixed.speed')}
            value={curve.flat.speed} min={0} max={100} trackFill formatValue={v => `${v}%`}
            onChange={v => set({ flat: { speed: v } })} />
        )}

        {curve.type === 'linear' && (
          <div className={styles.linearControls}>
            <RangeSlider orientation="stacked" editable label={t('cooling.curve.linear.temp')}
              value={[curve.linear.minTemp, curve.linear.maxTemp]}
              min={20} max={100} formatValue={v => `${v}°`}
              onChange={([minTemp, maxTemp]) => set({ linear: { ...curve.linear, minTemp, maxTemp } })} />
            <RangeSlider orientation="stacked" editable label={t('cooling.curve.linear.speed')}
              value={[curve.linear.minSpeed, curve.linear.maxSpeed]}
              min={0} max={100} formatValue={v => `${v}%`}
              onChange={([minSpeed, maxSpeed]) => set({ linear: { ...curve.linear, minSpeed, maxSpeed } })} />
            <ResponseTimeSlider value={curve.linear.responseTime}
              onChange={v => set({ linear: { ...curve.linear, responseTime: v } })} />
          </div>
        )}

        {curve.type === 'graph' && (
          <>
            <CurveGraph points={curve.graph.points}
              currentTemp={sources.find(s => s.id === curve.sourceId)?.value}
              onChange={pts => set({ graph: { ...curve.graph, points: pts } })} />
            <ResponseTimeSlider value={curve.graph.responseTime}
              onChange={v => set({ graph: { ...curve.graph, responseTime: v } })} />
          </>
        )}

        {curve.type === 'mix' && (
          <>
            <MixControls curve={curve} allCurves={allCurves} sources={sources} onChange={onChange} />
            <ResponseTimeSlider value={curve.mix.responseTime}
              onChange={v => set({ mix: { ...curve.mix, responseTime: v } })} />
          </>
        )}

        <div className={styles.curveCardFooterActions}>
          {isPreset && onResetPreset && (
            <HoverTooltip body={t('cooling.curves.resetToDefaults')} side="top">
              <button type="button" className={styles.curveCardResetBtn}
                onClick={e => { e.stopPropagation(); onResetPreset(); }}
                disabled={!isPresetCurveDirty(curve)}>
                <RotateCcw size={12} aria-hidden />
                <span>{t('cooling.curves.resetBtn')}</span>
              </button>
            </HoverTooltip>
          )}
          <HoverTooltip body={t('cooling.curves.delete')} side="top">
            <button type="button" className={styles.curveCardRemoveBtn}
              onClick={e => { e.stopPropagation(); onDelete(); }}>
              <Trash2 size={12} aria-hidden />
              <span>{t('cooling.curves.removeBtn')}</span>
            </button>
          </HoverTooltip>
        </div>
      </div>
      )}

      {/* Chevron at bottom-center toggles expansion. Card body clicks only
          expand; collapse is the chevron's job (or selecting another curve
          via the single-expansion invariant up in CoolingView). */}
      <button
        type="button"
        className={styles.curveCardChevron}
        onClick={e => { e.stopPropagation(); if (expanded) onCollapse(); else onExpand(); }}
        aria-label={expanded ? t('cooling.curves.collapse') : t('cooling.curves.expand')}
        title={expanded ? t('cooling.curves.collapse') : t('cooling.curves.expand')}
      >
        {expanded ? <ChevronUp size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}
      </button>
    </div>
  );
});
