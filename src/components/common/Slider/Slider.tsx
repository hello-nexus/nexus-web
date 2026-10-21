import { useEffect, useId, useRef, type CSSProperties, type PointerEventHandler, type ReactNode } from 'react';
import { EditableNumber } from '../Editable/EditableNumber';
import { InfoTooltip } from '../InfoTooltip/InfoTooltip';
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
 *   - showRange   : prints min / max under the track
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
  /** One-sentence explanation shown behind an info affordance beside the label. */
  info?: string;
  /** Interactive node after the label (and `info`), e.g. a link to the setting
      that caps this slider. Sits on the label's baseline row like `info`. */
  labelAction?: ReactNode;
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
      secondary level such as the master-brightness cap. Omit to draw no
      pointer. */
  marker?: number;
  /** A [from, to] span of the scale drawn on the track, e.g. how far audio modulation can move the value. */
  band?: readonly [number, number];
  /** Optional node stacked directly above the marker caret (e.g. an info
      affordance). Interactive; only rendered when `marker` is set. */
  markerLabel?: ReactNode;
  /** When the fill runs past this value (in [min, max]), the portion beyond it
      is painted in a dimmed accent - e.g. a master-brightness cap the device is
      set above. Requires trackFill; omit for a single-tone fill. */
  fillCap?: number;
  ariaLabel?: string;
  className?: string;
  /** The controlled targets hold different values. No value is shown or filled; the value
      slot reads `mixedLabel` and the thumb is ghosted. A drag sets one value for all, and an
      `editable` slider keeps its field: empty, with `mixedLabel` as placeholder, and a typed
      value sets all. */
  mixed?: boolean;
  /** Visible text and spoken value while `mixed`. */
  mixedLabel?: string;
}

/** Width of the range thumb, as set in src/styles/global.scss. */
const THUMB_PX = 14;

/**
 * Where a value at `pct` (0..100) of the range sits along the track. The thumb's
 * centre stops half a thumb short of each end, so the value is that far along the
 * thumb's path, not `pct` of the track's whole length; the two only agree at 50%.
 */
const onThumbPath = (pct: number) => `calc(${THUMB_PX / 2}px + (100% - ${THUMB_PX}px) * ${pct / 100})`;

export function Slider({
  label = '', info, value, min, max, step = 1,
  orientation = 'inline', editable = false, zeroMarker = false, showRange = false,
  formatValue, onChange, onCommit, onPointerDown, onPointerCancel,
  disabled, trackFill, marker, markerLabel, band, fillCap, ariaLabel, className, labelAction, mixed = false, mixedLabel,
}: SliderProps) {
  const rangeId = useId();
  const latestInputValueRef = useRef(value);
  const onCommitRef = useRef(onCommit);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Removes the window release listeners armed by a pointer-down; null when no drag is open.
  const releaseCleanupRef = useRef<(() => void) | null>(null);
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
  // Never past the fill end, or the gradient stops would decrease and mispaint.
  const capPct = fillCap != null ? Math.min(clamp(((fillCap - min) / (max - min)) * 100), fillEndPct) : null;
  // A level fill starts at the track's own end; every other stop is a value, placed on the
  // thumb's path so the fill ends under the thumb's centre and a centre-out fill starts where
  // the thumb sits at 0, also when 0 is not the middle of the range.
  const trackStyle = {
    '--slider-fill-start': mixed || !isBipolar ? '0%' : onThumbPath(fillStartPct),
    '--slider-fill-end': mixed ? '0%' : onThumbPath(fillEndPct),
    ...(capPct != null ? { '--slider-fill-cap': onThumbPath(capPct) } : {}),
  } as CSSProperties;
  const markerPct = marker != null ? clamp(((marker - min) / (max - min)) * 100) : null;
  const bandPct = band ? band.map(v => clamp(((v - min) / (max - min)) * 100)).sort((a, b) => a - b) : null;
  const bandNode = bandPct ? (
    <span className={styles.band} style={{ left: `${bandPct[0]}%`, width: `${bandPct[1] - bandPct[0]}%` }} aria-hidden />
  ) : null;
  const markerNode = markerPct != null ? (
    <span className={styles.marker} style={{ left: `${markerPct}%` }}>
      {markerLabel != null && <span className={styles.markerLabel}>{markerLabel}</span>}
      <span className={styles.markerCaret} aria-hidden />
    </span>
  ) : null;
  // The zero tick, band and marker are placed on the thumb's path too, so each lines up
  // with the thumb at its value.
  const scaleNode = showZero || bandNode || markerNode ? (
    <span className={styles.scale}>
      {showZero && <span className={styles.zeroTick} style={{ left: `${zeroPct}%` }} />}
      {bandNode}
      {markerNode}
    </span>
  ) : null;

  useEffect(() => {
    latestInputValueRef.current = value;
  }, [value]);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  // Unmounting, or becoming disabled, drops an armed drag and any commit still
  // deferred: neither commits, because a gone or disabled slider must not call onCommit.
  const dropGesture = () => {
    releaseCleanupRef.current?.();
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
  };
  useEffect(() => dropGesture, []);
  useEffect(() => {
    if (disabled) dropGesture();
  }, [disabled]);

  const handleChange = (next: number, commit = false) => {
    latestInputValueRef.current = next;
    onChange(next, commit);
  };

  // A typed edit is a complete gesture: it has no drag-end, so nothing would
  // fire onCommit and consumers that persist/apply there (the effect editor
  // applies the shader and refreshes its thumbnail in onCommit) saw the value
  // land in state and nothing else happen. Mirror the drag-end here.
  const handleEditCommit = (next: number) => {
    handleChange(next, true);
    // Same shape as the drag-end commit below: cancel any deferred commit so a
    // trailing pointer-up cannot re-commit a stale value over the typed one.
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    onCommitRef.current?.(next);
  };

  const fmt = (v: number) => (formatValue ? formatValue(v) : String(v));
  const valueClass = mixed ? `${styles.value} ${styles.mixedValue}` : styles.value;
  const valueNode = editable ? (
    <EditableNumber value={value} min={min} max={max} step={step}
      onCommit={handleEditCommit} format={formatValue} className={valueClass} disabled={disabled}
      mixed={mixed} mixedLabel={mixedLabel} />
  ) : (
    <span className={valueClass}>{mixed ? mixedLabel : fmt(value)}</span>
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
          onCommit={handleEditCommit} format={formatValue} ariaLabel={ariaLabel} className={valueClass} disabled={disabled}
          mixed={mixed} mixedLabel={mixedLabel} />
      ) : (
        <span className={valueClass}>{mixed ? mixedLabel : fmt(value)}</span>
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

  // A drag ends wherever the pointer is let go, which may be off the track, so the
  // window hears the release. While a drag is armed this is the only pointer path
  // that commits; the input's own release handler stands down.
  const armRelease = (pointerId: number | undefined) => {
    releaseCleanupRef.current?.();
    const cleanup = () => {
      window.removeEventListener('pointerup', onRelease);
      window.removeEventListener('pointercancel', onRelease);
      releaseCleanupRef.current = null;
    };
    const onRelease = (e: PointerEvent) => {
      // Only the pointer that pressed ends the gesture.
      if (pointerId != null && e.pointerId != null && e.pointerId !== pointerId) return;
      cleanup();
      handleEnd();
    };
    window.addEventListener('pointerup', onRelease);
    window.addEventListener('pointercancel', onRelease);
    releaseCleanupRef.current = cleanup;
  };

  const endArmedGesture = () => {
    const cleanup = releaseCleanupRef.current;
    if (!cleanup) return;
    cleanup();
    handleEnd();
  };

  const range = (
    <input type="range" min={min} max={max} step={step} value={value}
      id={rangeId}
      disabled={disabled}
      aria-label={ariaLabel}
      data-fill=""
      data-mixed={mixed ? 'true' : undefined}
      aria-valuetext={mixed ? mixedLabel : undefined}
      style={trackStyle}
      onChange={e => handleChange(Number(e.target.value), false)}
      onPointerDown={e => {
        onPointerDown?.(e);
        // A secondary button does not drag the thumb, so it arms nothing.
        if (e.button > 0) return;
        armRelease(e.pointerId);
      }}
      // A press whose release never arrives (capture lost) ends the gesture here.
      onLostPointerCapture={endArmedGesture}
      onPointerUp={() => { if (!releaseCleanupRef.current) handleEnd(); }}
      onPointerCancel={e => {
        onPointerCancel?.(e);
        if (!releaseCleanupRef.current) handleEnd();
      }}
      onKeyUp={handleEnd}
      className={styles.range} />
  );

  if (orientation === 'bare') {
    return (
      <div className={`${styles.root} ${styles.bare} ${className ?? ''}`}>
        <div className={styles.track}>
          {range}
          {scaleNode}
        </div>
      </div>
    );
  }

  if (orientation === 'stacked') {
    return (
      // A div with a label on the name only: a wrapping label forwards a click on
      // the value or name to its first labelable descendant, a labelAction button.
      <div className={`${styles.root} ${styles.stacked} ${className ?? ''}`}>
        <div className={styles.head}>
          <span className={styles.label}>{label && <label htmlFor={rangeId}>{label}</label>}{info && <InfoTooltip message={info} side="top" />}{labelAction}</span>
          {valueNode}
        </div>
        <div className={styles.track}>
          {range}
          {scaleNode}
        </div>
        {showRange && (
          <div className={styles.rangeLabels}>
            <span>{formatValue ? formatValue(min) : min}</span>
            <span>{formatValue ? formatValue(max) : max}</span>
          </div>
        )}
      </div>
    );
  }

  // A div, not a label: a label forwards a click on the value to its first
  // labelable descendant (the range input) and focuses it, which in the inline
  // order (range before value) steals focus from the just-opened edit input and
  // reverts it. The range carries its own aria-label, so no label is needed.
  return (
    <div className={`${styles.root} ${styles.inline} ${className ?? ''}`}>
      {label && <span className={styles.label}>{label}{info && <InfoTooltip message={info} side="top" />}{labelAction}</span>}
      <div className={styles.track}>
        {range}
        {scaleNode}
      </div>
      {inlineValueNode}
    </div>
  );
}
