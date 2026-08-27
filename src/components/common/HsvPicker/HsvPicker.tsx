import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { hexToHsv, hsvToHex } from '../../../lib/settings';
import styles from './HsvPicker.module.scss';

/*
 * Custom HSV color picker. Three controls drive the same `value`:
 *   - SV square (saturation x value, hue tinted background)
 *   - Hue slider (0-360 rainbow strip)
 *   - Hex input (live-validated /^#[0-9a-f]{6}$/i; reverts to the picker's own
 *     color on blur)
 *
 * Pointer drag fires `onPreview(hex)` on every move (live theme application
 * without persistence) and `onCommit(hex)` once on release. Custom because the
 * native <input type="color"> renders a truncated palette under some WebView2
 * builds.
 *
 * HSV is the source of truth, not the hex prop: hex->hsv quantizes to 8 bits
 * (drifting the SV cursor off the pointer) and returns hue 0 for every
 * achromatic hex, which is the square's whole left and bottom edge.
 */
export interface HsvPickerProps {
  value: string;
  onPreview: (hex: string) => void;
  onCommit: (hex: string) => void;
}

interface Hsv { h: number; s: number; v: number }

export function HsvPicker({ value, onPreview, onCommit }: HsvPickerProps) {
  const { t } = useTranslation();
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  // The field reads from `hsv` unless the user is typing in it; a host that does
  // not echo the emitted hex back would otherwise leave the text contradicting
  // the cursors.
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const hsvRef = useRef(hsv);
  hsvRef.current = hsv;
  const endDragRef = useRef<(() => void) | null>(null);

  // Adopt an externally-driven value, but ignore the echo of our own emit: the
  // parent hands back the hex we just produced, which round-trips to a slightly
  // different (and, when achromatic, hue-less) HSV triple.
  useEffect(() => {
    setHsv(prev => (hsvToHex(prev.h, prev.s, prev.v).toLowerCase() === value.toLowerCase()
      ? prev
      : adoptHue(hexToHsv(value), prev.h)));
  }, [value]);

  // A drag outliving its own UI would commit a color the user can no longer see.
  useEffect(() => () => endDragRef.current?.(), []);

  const { h, s, v } = hsv;
  const hex = hsvToHex(h, s, v);

  const readSv = useCallback((e: PointerEvent | React.PointerEvent): Partial<Hsv> | null => {
    const el = svRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return { s: x * 100, v: (1 - y) * 100 };
  }, []);

  const readHue = useCallback((e: PointerEvent | React.PointerEvent): Partial<Hsv> | null => {
    const el = hueRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return null;
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return { h: x * 360 };
  }, []);

  const handleDrag = useCallback((
    startEvent: React.PointerEvent,
    reader: (e: PointerEvent | React.PointerEvent) => Partial<Hsv> | null,
  ) => {
    // The drag owns the triple for its whole lifetime, so an axis the pointer is
    // not moving (hue while dragging the square) is carried, never re-derived.
    let latest = hsvRef.current;
    const before = latest;
    const apply = (e: PointerEvent | React.PointerEvent) => {
      const part = reader(e);
      if (!part) return null;
      latest = { ...latest, ...part };
      setHsv(latest);
      return hsvToHex(latest.h, latest.s, latest.v);
    };
    const teardown = () => {
      endDragRef.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
    const move = (e: PointerEvent) => {
      const moved = apply(e);
      if (moved) onPreview(moved);
    };
    const up = (e: PointerEvent) => {
      const released = apply(e);
      teardown();
      if (released) onCommit(released);
    };
    // A cancel abandons the gesture (a browser pan takeover on the touch panels),
    // so the pre-drag color is restored rather than persisted.
    const cancel = () => {
      teardown();
      setHsv(before);
      onPreview(hsvToHex(before.h, before.s, before.v));
    };
    endDragRef.current = teardown;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    const startHex = apply(startEvent);
    if (startHex) onPreview(startHex);
  }, [onPreview, onCommit]);

  const handleHexChange = (raw: string) => {
    setHexDraft(raw);
    const normalized = raw.trim().startsWith('#') ? raw.trim() : `#${raw.trim()}`;
    if (/^#[0-9a-f]{6}$/i.test(normalized)) {
      setHsv(prev => adoptHue(hexToHsv(normalized), prev.h));
      onCommit(normalized.toLowerCase());
    }
  };

  return (
    <div className={styles.hsvPicker}>
      <div
        ref={svRef}
        className={styles.svSquare}
        style={{ backgroundColor: `hsl(${h}, 100%, 50%)` }}
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); handleDrag(e, readSv); }}
      >
        <div className={styles.svWhiteGradient} />
        <div className={styles.svBlackGradient} />
        <div className={styles.svCursor} style={{ left: `${s}%`, top: `${100 - v}%` }} />
      </div>
      <div
        ref={hueRef}
        className={styles.hueSlider}
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); handleDrag(e, readHue); }}
      >
        <div className={styles.hueCursor} style={{ left: `${(h / 360) * 100}%` }} />
      </div>
      <input
        type="text"
        className={styles.hexInput}
        value={hexDraft ?? hex.toUpperCase()}
        onChange={e => handleHexChange(e.target.value)}
        onFocus={() => setHexDraft(hex.toUpperCase())}
        onBlur={() => setHexDraft(null)}
        spellCheck={false}
        maxLength={7}
        aria-label={t('common.hexColor')}
      />
    </div>
  );
}

/** An achromatic hex carries no hue; keep the one the user last aimed at. */
function adoptHue(next: Hsv, fallbackH: number): Hsv {
  return next.s === 0 || next.v === 0 ? { ...next, h: fallbackH } : next;
}
