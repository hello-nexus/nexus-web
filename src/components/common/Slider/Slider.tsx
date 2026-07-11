import { useEffect, useRef, type CSSProperties, type PointerEventHandler, type ReactNode } from 'react';
import { EditableNumber } from '../Editable/EditableNumber';
import styles from './Slider.module.scss';

/*
 * Unified slider primitive.
 *
 * Layouts:
 *   - 'inline'   : [label] [=== track ===] [value]
 *   - 'stacked'  : [label]               [value]
 *                  [================ track =================]
 *   - 'bare'     : [================ track =================]
 *                  Renders only the input. Useful when the consumer wraps
 *                  the slider with its own icon and value markup (e.g. the
 *                  panel brightness widgets) and just needs the unified
 *                  thumb/track chrome.
 *
 * Optional features:
 *   - editable    : value display becomes click-to-edit (uses EditableNumber)
 *   - zeroMarker  : if range straddles zero, draws a tick at 0 on the track
 *   - showRange   : prints min / max under the track (DPI-style)
 *   - formatValue : controls how the value is rendered (e.g. '1.5s', '800 DPI')
 *   - trackFill   : the accent fill end. Auto-computes from value/min/max
 *                   (centre-out when the range straddles zero, e.g. -100..100).
 *                   Pass a number (0..100) to set the fill end explicitly.
 *
 * Callbacks:
 *   - onChange(v, commit?) fires for every range step AND for committed input edits.
 *     `commit` is true only when the user types a precise value into the editable
 *     field, so the parent can apply + persist in one shot. For drag, parents wire
 *     `onCommit()` to the gesture-end so persistence happens once at the end.
 */
export interface SliderProps {
  label?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  orientation?: 'inline' | 'stacked' | 'bare';
  editable?: boolean;
  zeroMarker?: boolean;
  showRange?: boolean;
  formatValue?: (v: number) => string;
  onChange: (v: number, commit?: boolean) => void;
  onCommit?: (v: number) => void;
  onPointerDown?: PointerEventHandler<HTMLInputElement>;
  onPointerCancel?: PointerEventHandler<HTMLInputElement>;
  disabled?: boolean;
  trackFill?: boolean | number;
  /** Pointer drawn at this value (in [min, max]) on the track, marking a
      secondary level such as the effective brightness after the global
      multiplier. Omit to draw no pointer. */
  marker?: number;
  /** Optional node stacked directly above the marker caret (e.g. an info
      affordance). Interactive; only rendered when `marker` is set. */
  markerLabel?: ReactNode;
  ariaLabel?: string;
  className?: string;
}

export function Slider({
  label = '', value, min, max, step = 1,
  orientation = 'inline', editable = false, zeroMarker = false, showRange = false,
  formatValue, onChange, onCommit, onPointerDown, onPointerCancel,
  disabled, trackFill, marker, markerLabel, ariaLabel, className,
}: SliderProps) {
  const latestInputValueRef = useRef(value);
  const onCommitRef = useRef(onCommit);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showZero = zeroMarker && min < 0 && max > 0;
  const zeroPct = showZero ? ((0 - min) / (max - min)) * 100 : 0;
  // A numeric `trackFill` sets the fill end explicitly; otherwise it
  // auto-computes (centre-out when the range straddles zero).
  const isBipolar = min < 0 && max > 0;
  const valuePct = ((value - min) / (max - min)) * 100;
  const clamp = (v: number) => Math.min(100, Math.max(0, v));
  let fillStartPct = 0;
  let fillEndPct: number;
  if (isBipolar) {
    const centerPct = ((0 - min) / (max - min)) * 100;
    fillStartPct = clamp(Math.min(centerPct, valuePct));
    fillEndPct = clamp(Math.max(centerPct, valuePct));
  } else if (typeof trackFill === 'number') {
    fillEndPct = clamp(trackFill);
  } else {
    fillEndPct = clamp(valuePct);
  }
  const trackStyle = {
    '--slider-fill-start': `${fillStartPct}%`,
    '--slider-fill-end': `${fillEndPct}%`,
  } as CSSProperties;
  const markerPct = marker != null ? clamp(((marker - min) / (max - min)) * 100) : null;
  const markerNode = markerPct != null ? (
    <span className={styles.marker} style={{ left: `${markerPct}%` }}>
      {markerLabel != null && <span className={styles.markerLabel}>{markerLabel}</span>}
      <span className={styles.markerCaret} aria-hidden />
    </span>
  ) : null;

  useEffect(() => {
    latestInputValueRef.current = value;
  }, [value]);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  useEffect(() => () => {
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
  }, []);

  const handleChange = (next: number, commit = false) => {
    latestInputValueRef.current = next;
    onChange(next, commit);
  };

  const fmt = (v: number) => (formatValue ? formatValue(v) : String(v));
  const valueNode = editable ? (
    <EditableNumber value={value} min={min} max={max} step={step}
      onCommit={v => handleChange(v, true)} format={formatValue} className={styles.value} />
  ) : (
    <span className={styles.value}>{fmt(value)}</span>
  );

  // Inline layout only: reserve the value column at the widest formatted
  // endpoint (in ch, +1 to cover a suffix glyph wider than a digit) so the
  // track's right edge doesn't shift as the value's width changes. The value
  // is the sole, right-aligned child of the reserver, so its click/hit area
  // is never overlapped.
  const reserveCh = Math.max(fmt(min).length, fmt(max).length) + 1;
  const inlineValueNode = (
    <span className={styles.inlineValue} style={{ minWidth: `${reserveCh}ch` }}>
      {editable ? (
        <EditableNumber value={value} min={min} max={max} step={step}
          onCommit={v => handleChange(v, true)} format={formatValue} ariaLabel={ariaLabel} className={styles.value} />
      ) : (
        <span className={styles.value}>{fmt(value)}</span>
      )}
    </span>
  );

  const handleEnd = () => {
    if (!onCommitRef.current) return;
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    // Some native range track taps deliver pointer-up before React has seen
    // the final input event. Defer one tick so the committed value matches the
    // last previewed slider value, not the stale DOM value from pointer-up.
    commitTimerRef.current = setTimeout(() => {
      commitTimerRef.current = null;
      onCommitRef.current?.(latestInputValueRef.current);
    }, 0);
  };

  const range = (
    <input type="range" min={min} max={max} step={step} value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      data-fill=""
      style={trackStyle}
      onChange={e => handleChange(Number(e.target.value), false)}
      onPointerDown={onPointerDown}
      onPointerUp={handleEnd}
      onPointerCancel={e => {
        if (onPointerCancel) onPointerCancel(e);
        handleEnd();
      }}
      onKeyUp={handleEnd}
      className={styles.range} />
  );

  if (orientation === 'bare') {
    return (
      <div className={`${styles.root} ${styles.bare} ${className ?? ''}`}>
        <div className={styles.track}>
          {range}
          {showZero && <span className={styles.zeroTick} style={{ left: `${zeroPct}%` }} />}
          {markerNode}
        </div>
      </div>
    );
  }

  if (orientation === 'stacked') {
    return (
      <label className={`${styles.root} ${styles.stacked} ${className ?? ''}`}>
        <div className={styles.head}>
          <span className={styles.label}>{label}</span>
          {valueNode}
        </div>
        <div className={styles.track}>
          {range}
          {showZero && <span className={styles.zeroTick} style={{ left: `${zeroPct}%` }} />}
          {markerNode}
        </div>
        {showRange && (
          <div className={styles.rangeLabels}>
            <span>{formatValue ? formatValue(min) : min}</span>
            <span>{formatValue ? formatValue(max) : max}</span>
          </div>
        )}
      </label>
    );
  }

  // A div, not a label: a label forwards a click on the value to its first
  // labelable descendant (the range input) and focuses it, which in the inline
  // order (range before value) steals focus from the just-opened edit input and
  // reverts it. The range carries its own aria-label, so no label is needed.
  return (
    <div className={`${styles.root} ${styles.inline} ${className ?? ''}`}>
      {label && <span className={styles.label}>{label}</span>}
      <div className={styles.track}>
        {range}
        {showZero && <span className={styles.zeroTick} style={{ left: `${zeroPct}%` }} />}
        {markerNode}
      </div>
      {inlineValueNode}
    </div>
  );
}
