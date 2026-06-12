import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { hexToHsv, hsvToHex } from '../../../lib/settings';
import styles from './HsvPicker.module.scss';

/*
 * Custom HSV color picker. Three controls drive the same `value`:
 *   - SV square (saturation x value, hue tinted background)
 *   - Hue slider (0-360 rainbow strip)
 *   - Hex input (live-validated /^#[0-9a-f]{6}$/i; reverts to last valid on blur)
 *
 * Pointer drag fires `onPreview(hex)` on every move (live theme application
 * without persistence) and `onCommit(hex)` once on release. Custom because the
 * native <input type="color"> renders a truncated palette under some WebView2
 * builds.
 */
export interface HsvPickerProps {
  value: string;
  onPreview: (hex: string) => void;
  onCommit: (hex: string) => void;
}

export function HsvPicker({ value, onPreview, onCommit }: HsvPickerProps) {
  const { t } = useTranslation();
  const { h, s, v } = hexToHsv(value);
  const [hexInput, setHexInput] = useState(value.toUpperCase());
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHexInput(value.toUpperCase());
  }, [value]);

  const readSv = useCallback((e: PointerEvent | React.PointerEvent) => {
    const el = svRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return hsvToHex(h, x * 100, (1 - y) * 100);
  }, [h]);

  const readHue = useCallback((e: PointerEvent | React.PointerEvent) => {
    const el = hueRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return hsvToHex(x * 360, s, v);
  }, [s, v]);

  const handleDrag = useCallback((
    startEvent: React.PointerEvent,
    reader: (e: PointerEvent | React.PointerEvent) => string | null,
  ) => {
    const startHex = reader(startEvent);
    if (startHex) onPreview(startHex);
    const move = (e: PointerEvent) => {
      const hex = reader(e);
      if (hex) onPreview(hex);
    };
    const up = (e: PointerEvent) => {
      const hex = reader(e);
      if (hex) onCommit(hex);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [onPreview, onCommit]);

  const handleHexChange = (raw: string) => {
    setHexInput(raw);
    const normalized = raw.trim().startsWith('#') ? raw.trim() : `#${raw.trim()}`;
    if (/^#[0-9a-f]{6}$/i.test(normalized)) {
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
        value={hexInput}
        onChange={e => handleHexChange(e.target.value)}
        onBlur={() => setHexInput(value.toUpperCase())}
        spellCheck={false}
        maxLength={7}
        aria-label={t('common.hexColor')}
      />
    </div>
  );
}
