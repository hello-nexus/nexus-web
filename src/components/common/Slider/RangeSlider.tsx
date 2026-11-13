import { useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { EditableNumber } from '../Editable/EditableNumber';
import { InfoTooltip } from '../InfoTooltip/InfoTooltip';
import { NATIVE_KNOB_PX } from './Slider';
import { SliderMarks } from './SliderMarks';
import styles from './RangeSlider.module.scss';

/*
 * Dual-knob slider. Sibling of `Slider` for the case where the user picks an
 * interval rather than a single value (e.g. fan curve linear band: temperature
 * range and speed range).
 *
 * Track structure (back-to-front):
 *   .trackBg   - full-width gray underlay
 *   .trackBand - colored band positioned between minPct and maxPct.
 *                Pointer-grabbable: dragging it shifts both knobs together
 *                while preserving the gap.
 *   <input>    - min knob (transparent track via [data-range-knob], thumb only)
 *   <input>    - max knob (transparent track via [data-range-knob], thumb only)
 *
 * The inputs intentionally do NOT paint the band themselves (`data-fill` would
 * make each input's track render the gradient, which then occludes the
 * other input's thumb in z-order). Painting the band as a separate sibling
 * div keeps both thumbs visible and makes the band a real pointer target.
 *
 * The knobs keep a minimum separation: a fixed share of the span, rounded to
 * the step grid and never below one step. `minGap` can raise it, never lower
 * it. The active knob clamps at the gap; the other knob is NOT pushed along
 * (except during a band drag, where both knobs move together by the same
 * amount).
 *
 * Close thumbs overlap, and the later input wins the hit test. Past the
 * track midpoint the min knob is raised above the max knob, so the thumb on
 * top is always the one with room to move away.
 *
 * One-sided and live use (sensor alert bounds): `lowEnabled` / `highEnabled`
 * false hide that side's knob and value, and the band runs to that edge. The
 * hidden side's value is ignored by the gap clamp. `outsideTone` shades the
 * track outside the band on the enabled sides, `marker` points a live reading
 * under the track (stacked and bare layouts), and `softBounds` lets a typed
 * value land beyond min/max so the caller can widen the track.
 *
 * Open-ended use (`openEnded`, sensor alert limits): both knobs always stay on
 * screen. A side whose limit is off (`lowEnabled` / `highEnabled` false) parks
 * its knob at the track end, drawn hollow, and reads its off label. Dragging a
 * knob onto its end, typing a value at or past it, or clearing the field is
 * reported as the end value, which the caller reads as "no limit".
 */
export interface RangeSliderProps {
  label?: string;
  /** One-sentence explanation shown behind an info affordance beside the label. */
  info?: string;
  value: [number, number];
  min: number;
  max: number;
  step?: number;
  orientation?: 'inline' | 'stacked' | 'bare';
  editable?: boolean;
  showRange?: boolean;
  formatValue?: (v: number) => string;
  minGap?: number;
  onChange: (v: [number, number], commit?: boolean) => void;
  onCommit?: (v: [number, number]) => void;
  disabled?: boolean;
  ariaLabelMin?: string;
  ariaLabelMax?: string;
  className?: string;
  /** False hides the low knob and value; the band then starts at the track's left edge. Default true. */
  lowEnabled?: boolean;
  /** False hides the high knob and value; the band then ends at the track's right edge. Default true. */
  highEnabled?: boolean;
  /** A live reading pointed at under the track; `label` is its caption. Stacked and bare layouts. */
  marker?: { value: number; label: string };
  /** Shades the track outside the band on each enabled side. */
  outsideTone?: 'warn' | 'bad';
  /** A typed value may go beyond min/max (the caller widens the track); dragging stays inside. */
  softBounds?: boolean;
  /** Keeps both knobs visible when a side is off: the off knob sits hollow at its track end. */
  openEnded?: boolean;
  /** Readout of an off low side (openEnded). */
  lowOffLabel?: string;
  /** Readout of an off high side (openEnded). */
  highOffLabel?: string;
}


// Default knob separation as a share of the track span.
const DEFAULT_GAP_FRACTION = 1 / 40;

interface BandDragState {
  startX: number;
  startMin: number;
  startMax: number;
  trackWidth: number;
  pointerId: number;
}

export function RangeSlider({
  label = '', info, value, min, max, step = 1,
  orientation = 'inline', editable = false, showRange = false,
  formatValue, minGap, onChange, onCommit, disabled,
  ariaLabelMin, ariaLabelMax, className,
  lowEnabled = true, highEnabled = true, marker, outsideTone, softBounds = false,
  openEnded = false, lowOffLabel, highOffLabel,
}: RangeSliderProps) {
  const [valMin, valMax] = value;
  const span = max - min;
  const defaultGap = step > 0 ? Math.max(1, Math.round((span * DEFAULT_GAP_FRACTION) / step)) * step : 0;
  const gap = Math.max(defaultGap, minGap ?? 0);

  const latestRef = useRef<[number, number]>(value);
  const onCommitRef = useRef(onCommit);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<BandDragState | null>(null);

  useEffect(() => { latestRef.current = value; }, [value]);
  useEffect(() => { onCommitRef.current = onCommit; }, [onCommit]);
  useEffect(() => () => {
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    // Browsers auto-release pointer capture when the captured element is
    // removed from the DOM, but we still null the ref so a stale pointermove
    // delivered to a remounted instance can't act on a defunct gesture.
    dragRef.current = null;
  }, []);

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const minPct = lowEnabled ? clamp(((valMin - min) / span) * 100, 0, 100) : 0;
  const maxPct = highEnabled ? clamp(((valMax - min) / span) * 100, 0, 100) : 100;
  const bothEnabled = lowEnabled && highEnabled;

  const commitValue = (next: [number, number], commit = false) => {
    latestRef.current = next;
    onChange(next, commit);
  };

  const handleMinChange = (raw: number, commit = false) => {
    const lo = softBounds && commit ? Number.NEGATIVE_INFINITY : min;
    const next = clamp(raw, lo, highEnabled || openEnded ? valMax - gap : max);
    if (next === valMin && !commit) return;
    commitValue([next, valMax], commit);
  };

  const handleMaxChange = (raw: number, commit = false) => {
    const hi = softBounds && commit ? Number.POSITIVE_INFINITY : max;
    const next = clamp(raw, lowEnabled || openEnded ? valMin + gap : min, hi);
    if (next === valMax && !commit) return;
    commitValue([valMin, next], commit);
  };

  const handleEnd = () => {
    if (!onCommitRef.current) return;
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    // Match Slider's deferred commit: native range can deliver pointer-up
    // before the final input event. Defer one tick so onCommit sees the
    // latest preview, not the stale DOM value.
    commitTimerRef.current = setTimeout(() => {
      commitTimerRef.current = null;
      onCommitRef.current?.(latestRef.current);
    }, 0);
  };

  const onBandDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || !bothEnabled) return;
    const parent = e.currentTarget.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    if (rect.width <= 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startMin: valMin,
      startMax: valMax,
      trackWidth: rect.width,
      pointerId: e.pointerId,
    };
    e.preventDefault();
  };

  const onBandMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    let shift = (dx / d.trackWidth) * span;
    if (step > 0) shift = Math.round(shift / step) * step;
    // Whole interval slides as a rigid unit; clamp so neither knob escapes the bar.
    shift = clamp(shift, min - d.startMin, max - d.startMax);
    const next: [number, number] = [d.startMin + shift, d.startMax + shift];
    if (next[0] !== latestRef.current[0] || next[1] !== latestRef.current[1]) {
      commitValue(next, false);
    }
  };

  const onBandUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (e.currentTarget.hasPointerCapture(d.pointerId)) {
      e.currentTarget.releasePointerCapture(d.pointerId);
    }
    dragRef.current = null;
    handleEnd();
  };

  const fmt = formatValue ?? ((v: number) => String(v));

  // EditableNumber's `min` prop doubles as the snap-origin for its step grid,
  // so pass the slider's true min/max here (not the gap-narrowed bounds) -
  // otherwise on non-integer steps the typed grid is offset from the slider's.
  // The gap clamp happens in handleMinChange / handleMaxChange.
  const lowShown = lowEnabled || openEnded;
  const highShown = highEnabled || openEnded;
  const lowFormat = openEnded && !lowEnabled && lowOffLabel ? () => lowOffLabel : formatValue;
  const highFormat = openEnded && !highEnabled && highOffLabel ? () => highOffLabel : formatValue;
  const lowText = openEnded && !lowEnabled && lowOffLabel ? lowOffLabel : fmt(valMin);
  const highText = openEnded && !highEnabled && highOffLabel ? highOffLabel : fmt(valMax);
  const valueNode = editable ? (
    <span className={styles.valueGroup}>
      {lowShown && (
        <EditableNumber value={valMin} min={min} max={max} step={step}
          onCommit={v => handleMinChange(v, true)} format={lowFormat} unbounded={softBounds || openEnded}
          emptyValue={openEnded ? min : undefined}
          className={styles.value} ariaLabel={ariaLabelMin} disabled={disabled} />
      )}
      {lowShown && highShown && <span className={styles.valueSep} aria-hidden="true">-</span>}
      {highShown && (
        <EditableNumber value={valMax} min={min} max={max} step={step}
          onCommit={v => handleMaxChange(v, true)} format={highFormat} unbounded={softBounds || openEnded}
          emptyValue={openEnded ? max : undefined}
          className={styles.value} ariaLabel={ariaLabelMax} disabled={disabled} />
      )}
    </span>
  ) : (
    <span className={styles.value}>
      {lowShown && lowText}{lowShown && highShown && ' - '}{highShown && highText}
    </span>
  );

  const bandStyle: CSSProperties = {
    left: `${minPct}%`,
    width: `${Math.max(0, maxPct - minPct)}%`,
  };

  const trackInner = (
    <>
      <div className={styles.trackBg} aria-hidden="true" />
      {outsideTone && lowEnabled && (
        <div className={`${styles.outside} ${styles[outsideTone]}`} aria-hidden="true"
          data-outside="low" style={{ left: 0, width: `${minPct}%` }} />
      )}
      {outsideTone && highEnabled && (
        <div className={`${styles.outside} ${styles[outsideTone]}`} aria-hidden="true"
          data-outside="high" style={{ left: `${maxPct}%`, width: `${100 - maxPct}%` }} />
      )}
      <div className={`${styles.trackBand} ${bothEnabled ? '' : styles.bandStatic}`} aria-hidden="true"
        style={bandStyle}
        onPointerDown={onBandDown}
        onPointerMove={onBandMove}
        onPointerUp={onBandUp}
        onPointerCancel={onBandUp} />
      <input type="range" min={min} max={max} step={step} value={clamp(valMin, min, max)}
        disabled={disabled} aria-label={ariaLabelMin}
        data-range-knob="min"
        aria-hidden={lowEnabled || openEnded ? undefined : true} tabIndex={lowEnabled || openEnded ? undefined : -1}
        data-unset={openEnded && !lowEnabled ? 'true' : undefined}
        style={minPct > 50 ? { zIndex: 1 } : undefined}
        onChange={e => handleMinChange(Number(e.target.value), false)}
        onPointerUp={handleEnd}
        onPointerCancel={handleEnd}
        onKeyUp={handleEnd}
        className={`${styles.range} ${lowEnabled || openEnded ? '' : styles.knobOff}`} />
      <input type="range" min={min} max={max} step={step} value={clamp(valMax, min, max)}
        disabled={disabled} aria-label={ariaLabelMax}
        data-range-knob="max"
        aria-hidden={highEnabled || openEnded ? undefined : true} tabIndex={highEnabled || openEnded ? undefined : -1}
        data-unset={openEnded && !highEnabled ? 'true' : undefined}
        onChange={e => handleMaxChange(Number(e.target.value), false)}
        onPointerUp={handleEnd}
        onPointerCancel={handleEnd}
        onKeyUp={handleEnd}
        className={`${styles.range} ${highEnabled || openEnded ? '' : styles.knobOff}`} />
    </>
  );

  const markNode = marker ? (
    <div className={styles.markWrap}>
      <SliderMarks marks={[{ value: marker.value, label: marker.label }]} min={min} max={max} knobPx={NATIVE_KNOB_PX} side="below" />
    </div>
  ) : null;

  if (orientation === 'bare') {
    return (
      <div className={`${styles.root} ${styles.bare} ${className ?? ''}`}>
        {markNode ? (
          <div className={styles.markedColumn}>
            <div className={styles.track}>{trackInner}</div>
            {markNode}
          </div>
        ) : (
          <div className={styles.track}>{trackInner}</div>
        )}
      </div>
    );
  }

  if (orientation === 'stacked') {
    return (
      <div className={`${styles.root} ${styles.stacked} ${className ?? ''}`}>
        <div className={styles.head}>
          <span className={styles.label}>{label}{info && <InfoTooltip message={info} side="top" />}</span>
          {valueNode}
        </div>
        <div className={styles.track}>{trackInner}</div>
        {markNode}
        {showRange && (
          <div className={styles.rangeLabels}>
            <span>{fmt(min)}</span>
            <span>{fmt(max)}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`${styles.root} ${styles.inline} ${className ?? ''}`}>
      <span className={styles.label}>{label}{info && <InfoTooltip message={info} side="top" />}</span>
      <div className={styles.track}>{trackInner}</div>
      {valueNode}
    </div>
  );
}
