import { useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { EditableNumber } from '../Editable/EditableNumber';
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
 * `minGap` enforces a minimum separation between the two knobs in slider
 * units. Defaults to (max - min) * 0.1. The active knob clamps at the gap;
 * the other knob is NOT pushed along (except during a band drag, where both
 * knobs move together by the same amount).
 */
export interface RangeSliderProps {
  label?: string;
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
}

interface BandDragState {
  startX: number;
  startMin: number;
  startMax: number;
  trackWidth: number;
  pointerId: number;
}

export function RangeSlider({
  label = '', value, min, max, step = 1,
  orientation = 'inline', editable = false, showRange = false,
  formatValue, minGap, onChange, onCommit, disabled,
  ariaLabelMin, ariaLabelMax, className,
}: RangeSliderProps) {
  const [valMin, valMax] = value;
  const span = max - min;
  const gap = minGap ?? span * 0.1;

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
  const minPct = clamp(((valMin - min) / span) * 100, 0, 100);
  const maxPct = clamp(((valMax - min) / span) * 100, 0, 100);

  const commitValue = (next: [number, number], commit = false) => {
    latestRef.current = next;
    onChange(next, commit);
  };

  const handleMinChange = (raw: number, commit = false) => {
    const next = clamp(raw, min, valMax - gap);
    if (next === valMin && !commit) return;
    commitValue([next, valMax], commit);
  };

  const handleMaxChange = (raw: number, commit = false) => {
    const next = clamp(raw, valMin + gap, max);
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
    if (disabled) return;
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
  const valueNode = editable ? (
    <span className={styles.valueGroup}>
      <EditableNumber value={valMin} min={min} max={max} step={step}
        onCommit={v => handleMinChange(v, true)} format={formatValue}
        className={styles.value} ariaLabel={ariaLabelMin} />
      <span className={styles.valueSep} aria-hidden="true">-</span>
      <EditableNumber value={valMax} min={min} max={max} step={step}
        onCommit={v => handleMaxChange(v, true)} format={formatValue}
        className={styles.value} ariaLabel={ariaLabelMax} />
    </span>
  ) : (
    <span className={styles.value}>{fmt(valMin)} - {fmt(valMax)}</span>
  );

  const bandStyle: CSSProperties = {
    left: `${minPct}%`,
    width: `${Math.max(0, maxPct - minPct)}%`,
  };

  const trackInner = (
    <>
      <div className={styles.trackBg} aria-hidden="true" />
      <div className={styles.trackBand} aria-hidden="true"
        style={bandStyle}
        onPointerDown={onBandDown}
        onPointerMove={onBandMove}
        onPointerUp={onBandUp}
        onPointerCancel={onBandUp} />
      <input type="range" min={min} max={max} step={step} value={valMin}
        disabled={disabled} aria-label={ariaLabelMin}
        data-range-knob="min"
        onChange={e => handleMinChange(Number(e.target.value), false)}
        onPointerUp={handleEnd}
        onPointerCancel={handleEnd}
        onKeyUp={handleEnd}
        className={styles.range} />
      <input type="range" min={min} max={max} step={step} value={valMax}
        disabled={disabled} aria-label={ariaLabelMax}
        data-range-knob="max"
        onChange={e => handleMaxChange(Number(e.target.value), false)}
        onPointerUp={handleEnd}
        onPointerCancel={handleEnd}
        onKeyUp={handleEnd}
        className={styles.range} />
    </>
  );

  if (orientation === 'bare') {
    return (
      <div className={`${styles.root} ${styles.bare} ${className ?? ''}`}>
        <div className={styles.track}>{trackInner}</div>
      </div>
    );
  }

  if (orientation === 'stacked') {
    return (
      <div className={`${styles.root} ${styles.stacked} ${className ?? ''}`}>
        <div className={styles.head}>
          <span className={styles.label}>{label}</span>
          {valueNode}
        </div>
        <div className={styles.track}>{trackInner}</div>
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
      <span className={styles.label}>{label}</span>
      <div className={styles.track}>{trackInner}</div>
      {valueNode}
    </div>
  );
}
