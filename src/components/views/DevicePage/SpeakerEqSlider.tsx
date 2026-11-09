import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { snapDb } from './speakerUtils';
import styles from './LogitechSpeakerDevicePage.module.scss';

/** The slider's length in px; the dB scale beside the bands uses the same geometry. */
export const EQ_TRACK_PX = 300;
/** The thumb's diameter; its centre stops half a thumb short of each end. */
const THUMB_PX = 14;
/** Half the fill's width: how far its rounded 0 dB end reaches past the 0 dB line. */
const CAP_PX = 3;
/** Key steps in dB: arrows a half step either way, page keys three. */
const KEY_STEPS: Readonly<Record<string, number>> = {
  ArrowUp: 0.5, ArrowRight: 0.5, ArrowDown: -0.5, ArrowLeft: -0.5, PageUp: 3, PageDown: -3,
};

/** Where a gain sits along the slider, in px from its top: the thumb's centre at that gain. */
export function eqPos(db: number, min: number, max: number): number {
  return THUMB_PX / 2 + ((max - db) / (max - min)) * (EQ_TRACK_PX - THUMB_PX);
}

interface SpeakerEqSliderProps {
  value: number;
  min: number;
  max: number;
  /** The band, for assistive tech ("500 Hz"). */
  label: string;
  /** Spoken value ("-4.5 dB"). */
  valueText: string;
  disabled?: boolean;
  /** Every step of a drag. */
  onInput: (db: number) => void;
  /** The end of a drag, or a key press. */
  onCommit: (db: number) => void;
}

/**
 * One EQ band as G HUB draws it: a vertical slider whose fill runs from the 0 dB line
 * to the thumb, rounded at the 0 dB end. The fill and the thumb are placed on the same
 * path, so the fill always starts on the 0 dB line and ends under the thumb.
 */
export function SpeakerEqSlider({ value, min, max, label, valueText, disabled = false, onInput, onCommit }: SpeakerEqSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<number | null>(null);
  const zero = eqPos(0, min, max);
  const thumb = eqPos(value, min, max);
  // The rounded 0 dB end reaches past the line by half the fill's width, unless the
  // thumb is close enough to cover it.
  const capped = Math.abs(thumb - zero) >= THUMB_PX / 2 + CAP_PX;
  const fillTop = value < 0 ? zero - (capped ? CAP_PX : 0) : thumb;
  const fillBottom = value < 0 ? thumb : zero + (capped ? CAP_PX : 0);

  const dbAt = (clientY: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return value;
    const frac = (clientY - rect.top - THUMB_PX / 2) / (EQ_TRACK_PX - THUMB_PX);
    return snapDb(max - frac * (max - min), min, max);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button > 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    const db = dbAt(e.clientY);
    dragging.current = db;
    onInput(db);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current === null) return;
    const db = dbAt(e.clientY);
    if (db !== dragging.current) {
      dragging.current = db;
      onInput(db);
    }
  };
  const endDrag = () => {
    if (dragging.current === null) return;
    const db = dragging.current;
    dragging.current = null;
    onCommit(db);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const step = KEY_STEPS[e.key] as number | undefined;
    const next = step !== undefined ? snapDb(value + step, min, max)
      : e.key === 'Home' ? max
        : e.key === 'End' ? min
          : null;
    if (next === null) return;
    e.preventDefault();
    if (next !== value) onCommit(next);
  };

  return (
    <div
      ref={trackRef}
      className={`${styles.eqSlider} ${disabled ? styles.eqDisabled : ''}`}
      style={{ height: EQ_TRACK_PX }}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
      aria-disabled={disabled || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onKeyDown={onKeyDown}
    >
      <span className={styles.eqTrack} />
      {value !== 0 && <span className={styles.eqFill} style={{ top: fillTop, height: fillBottom - fillTop }} />}
      <span className={styles.eqThumb} style={{ top: thumb }} />
    </div>
  );
}
