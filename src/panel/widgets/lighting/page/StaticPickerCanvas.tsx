import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useTranslation } from '../../../../lib/i18n';
import { useEffectThumbnail } from '../../../../hooks/useEffectThumbnail';
import {
  PICKER_SEGMENT_COLS, PICKER_SEGMENT_ROWS, SEGMENT_SWATCHES, pickerHexAt, pickerPointFor, sameSwatch, snapToSegment,
} from './staticPickerField';
import styles from '../LightingPage.module.scss';

export interface PickerDevice {
  id: string;
  name: string;
  /** The colour this device currently wears. */
  hex: string;
}

// Matches the staticNoticeFade keyframes, which own the fade-out.
const NOTICE_MS = 2200;
/** Keeps a dot whole when its colour sits on the field's own edge. */
const DOT_EDGE = 15;
const LABEL_EDGE = 90;

interface Marker extends PickerDevice {
  /** Centre of the dot, or of the cell in segmented mode. */
  left: number;
  top: number;
  /** The colour is not the one this spot stands for, so the mark reads dashed. */
  inexact: boolean;
  align: 'start' | 'center' | 'end';
  /** The bottom row's label has no room below the cell. */
  labelAbove: boolean;
  /** Devices sharing this spot, beyond this one. */
  extra: number;
  /** Set in segmented mode: the cell to outline. */
  cell: { w: number; h: number } | null;
}

/**
 * Static mode's canvas. The colour field IS the picker: the selected devices
 * ride it on the colour they wear, and pressing anywhere moves every one of
 * them to the colour under the pointer. Segmented samples that same field on a
 * coarse grid, so a press snaps to a swatch and outlines it.
 *
 * A pattern effect (gradient, two-tone, spectrum) has its colours placed by the
 * effect rather than per device, so selecting one blasts its render across the
 * whole canvas, drops the marks, and answers a press with a notice instead.
 */
export function StaticPickerCanvas({
  devices, hasSelection, hex, segmented, patternEffect, patternSlot, patternVersion, gpuAvailable,
  onPreview, onCommit,
}: {
  /** Selected devices, in rail order. */
  devices: PickerDevice[];
  hasSelection: boolean;
  /** The colour the selection shares; '' when they disagree. */
  hex: string;
  /** Sample the field on the coarse grid instead of continuously. */
  segmented: boolean;
  /** Non-null when the selection wears a pattern - the field is replaced by it. */
  patternEffect: string | null;
  patternSlot: number;
  patternVersion: string;
  gpuAvailable: boolean;
  /** Fires per pointer-move; the caller paces its own writes. */
  onPreview: (hex: string) => void;
  onCommit: (hex: string) => void;
}) {
  const { t } = useTranslation();
  const fieldRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [notice, setNotice] = useState<{ title: string; body: string } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragging = useRef(false);
  const lastHex = useRef<string | null>(null);
  // Held only while the input is focused, so a half-typed hex is not clobbered
  // by the value the last valid keystroke already committed.
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const blastUrl = useEffectThumbnail(
    patternEffect ?? '', patternSlot, patternVersion,
    !patternEffect || !gpuAvailable, true,
  );

  useLayoutEffect(() => {
    const el = fieldRef.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);

  const showNotice = useCallback((title: string, body: string) => {
    setNotice({ title, body });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);

  // One mark per spot: devices sharing a colour (or a cell) collapse into it and
  // the label's count is what says how many.
  const markers = useMemo<Marker[]>(() => {
    if (patternEffect || !size.w || !size.h) return [];
    const cw = size.w / PICKER_SEGMENT_COLS;
    const ch = size.h / PICKER_SEGMENT_ROWS;
    const out: Marker[] = [];
    const at = new Map<string, number>();
    for (const d of devices) {
      if (!d.hex) continue;
      const p = pickerPointFor(d.hex);
      const col = Math.min(PICKER_SEGMENT_COLS - 1, Math.floor(p.x * PICKER_SEGMENT_COLS));
      const row = Math.min(PICKER_SEGMENT_ROWS - 1, Math.floor(p.y * PICKER_SEGMENT_ROWS));
      const key = segmented ? `${col},${row}` : d.hex.toLowerCase();
      const seen = at.get(key);
      if (seen !== undefined) {
        out[seen].extra += 1;
        continue;
      }
      at.set(key, out.length);
      const left = segmented
        ? (col + 0.5) * cw
        : Math.min(size.w - DOT_EDGE, Math.max(DOT_EDGE, p.x * size.w));
      const top = segmented
        ? (row + 0.5) * ch
        : Math.min(size.h - DOT_EDGE, Math.max(DOT_EDGE, p.y * size.h));
      const swatch = SEGMENT_SWATCHES[row * PICKER_SEGMENT_COLS + col];
      out.push({
        ...d,
        left,
        top,
        inexact: segmented ? !sameSwatch(d.hex.toLowerCase(), swatch.toLowerCase()) : p.offField,
        align: left < LABEL_EDGE ? 'start' : left > size.w - LABEL_EDGE ? 'end' : 'center',
        labelAbove: segmented && row === PICKER_SEGMENT_ROWS - 1,
        extra: 0,
        cell: segmented ? { w: cw, h: ch } : null,
      });
    }
    return out;
  }, [devices, patternEffect, segmented, size.h, size.w]);

  const hexAtEvent = useCallback((clientX: number, clientY: number) => {
    const el = fieldRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const fx = (clientX - r.left) / r.width;
    const fy = (clientY - r.top) / r.height;
    const p = segmented ? snapToSegment(fx, fy) : { x: fx, y: fy };
    return pickerHexAt(p.x, p.y);
  }, [segmented]);

  const blocked = () => {
    if (patternEffect) {
      showNotice(t('lighting.static.patternNoticeTitle'), t('lighting.static.patternNoticeBody'));
      return true;
    }
    if (!hasSelection) {
      showNotice(t('lighting.static.selectNoticeTitle'), t('lighting.static.selectNoticeBody'));
      return true;
    }
    return false;
  };

  const handleDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (blocked()) return;
    const picked = hexAtEvent(e.clientX, e.clientY);
    if (!picked) return;
    dragging.current = true;
    lastHex.current = picked;
    e.currentTarget.setPointerCapture(e.pointerId);
    onPreview(picked);
  };

  const handleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const picked = hexAtEvent(e.clientX, e.clientY);
    if (!picked || picked === lastHex.current) return;
    lastHex.current = picked;
    onPreview(picked);
  };

  const handleUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (lastHex.current) onCommit(lastHex.current);
  };

  const handleHexChange = (raw: string) => {
    setHexDraft(raw);
    const trimmed = raw.trim();
    const normalized = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
    if (/^#[0-9a-f]{6}$/i.test(normalized)) onCommit(normalized.toLowerCase());
  };

  const handleCopy = async () => {
    if (!hex) return;
    try {
      await navigator.clipboard.writeText(hex.toUpperCase());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* older panel WebViews have no async clipboard; no toast to show */ }
  };

  return (
    <div className={styles.staticPicker}>
      <div
        ref={fieldRef}
        className={`${styles.staticField} ${patternEffect ? styles.staticFieldPattern : ''} ${!patternEffect && segmented ? styles.staticFieldSegmented : ''}`}
        style={patternEffect && blastUrl ? { backgroundImage: `url(${blastUrl})` } : undefined}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
      >
        {!patternEffect && segmented && (
          <div
            className={styles.staticSegments}
            style={{
              gridTemplateColumns: `repeat(${PICKER_SEGMENT_COLS}, 1fr)`,
              gridTemplateRows: `repeat(${PICKER_SEGMENT_ROWS}, 1fr)`,
            }}
            aria-hidden
          >
            {SEGMENT_SWATCHES.map((swatch, i) => (
              <span key={i} style={{ backgroundColor: swatch }} />
            ))}
          </div>
        )}
        {markers.map(m => (
          <div key={m.id} className={styles.staticPin} style={{ left: `${m.left}px`, top: `${m.top}px` }}>
            {m.cell ? (
              <span
                className={`${styles.staticCell} ${m.inexact ? styles.staticCellInexact : ''}`}
                style={{ width: `${m.cell.w}px`, height: `${m.cell.h}px` }}
              />
            ) : (
              <span
                className={`${styles.staticPinDot} ${m.inexact ? styles.staticPinDotOff : ''}`}
                style={{ backgroundColor: m.hex }}
              />
            )}
            <span
              className={[
                styles.staticPinLabel,
                m.align === 'start' ? styles.staticPinLabelStart : '',
                m.align === 'end' ? styles.staticPinLabelEnd : '',
                m.labelAbove ? styles.staticPinLabelAbove : '',
              ].join(' ')}
            >
              {m.name}
              {m.extra > 0 && <span className={styles.staticPinCount}>{`+${m.extra}`}</span>}
            </span>
          </div>
        ))}
        {!patternEffect && hasSelection && (
          // Its own pointer target: a press here aims at the input, not the field.
          <div className={styles.staticHex} onPointerDown={e => e.stopPropagation()}>
            <span className={styles.staticHexSwatch} style={hex ? { backgroundColor: hex } : undefined} />
            <input
              type="text"
              className={styles.staticHexInput}
              value={hexDraft ?? (hex ? hex.toUpperCase() : '')}
              onChange={e => handleHexChange(e.target.value)}
              onFocus={() => setHexDraft(hex ? hex.toUpperCase() : '')}
              onBlur={() => setHexDraft(null)}
              spellCheck={false}
              maxLength={7}
              aria-label={t('common.hexColor')}
            />
            <button
              type="button"
              className={styles.staticHexCopy}
              onClick={() => { void handleCopy(); }}
              disabled={!hex}
              aria-label={t('lighting.static.copyColor')}
            >
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            </button>
          </div>
        )}
        {notice && (
          <div className={styles.staticNotice}>
            <div className={styles.staticNoticeBox}>
              <strong>{notice.title}</strong>
              <span>{notice.body}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
