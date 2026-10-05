import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import type { KeyReactionPreview } from '../../../api/keyReactive';
import { subscribeLedFrame } from '../../../lib/ledFrameStore';
import { lift, liveLedBytes } from './keyReactionsUtils';
import styles from './TypeReactiveEditor.module.scss';

// LEDs read like the LED map's: round, a fixed ceiling on the diameter, a dark
// unlit fill, the accent ring on hover, all on the map's near-black plate.
const LED_FILL = 0.62;
const LED_MAX_DIAMETER = 22;
// Furthest a pointer may land from an LED centre and still count as that key.
const HIT_RADIUS = 0.6;
// Tracks the LED map's unlit fill (dim text mixed toward black).
const UNLIT_FLOOR = 56;
const ACCENT_FALLBACK = '#0a84ff';
// Brightness above which an LED throws a soft halo.
const HALO_THRESHOLD = 24;

/** Board bounds in key units, padded half a key so edge keys are never clipped. */
function boardBounds(p: KeyReactionPreview) {
  const half = 0.5;
  const x0 = Math.min(...p.x) - half;
  const y0 = Math.min(...p.y) - half;
  return { x0, y0, w: Math.max(...p.x) + half - x0, h: Math.max(...p.y) + half - y0 };
}

interface TypeReactiveBoardProps {
  preview: KeyReactionPreview | null;
  label: string;
  disabled: boolean;
  /** Paint the card's LED bytes from the output stream; otherwise the keys show unlit. */
  live: boolean;
  frameIndex: number;
  onPressLed: (led: number) => void;
  onPressRandom: () => void;
}

/** The keyboard drawn as LED-map style dots. Canvas rather than DOM so a full
 *  board repaints per frame without a node per key. Layout comes from the
 *  preview; colours come from the output stream. */
export function TypeReactiveBoard({
  preview, label, disabled, live, frameIndex, onPressLed, onPressRandom,
}: TypeReactiveBoardProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const hoverRef = useRef(-1);
  // Last painted bytes, so a hover change can repaint without a new frame.
  const lastRef = useRef<Uint8Array | null>(null);
  const paintRef = useRef<((rgb: Uint8Array) => void) | null>(null);

  const bounds = useMemo(
    () => (preview && preview.x.length > 0 ? boardBounds(preview) : null),
    [preview],
  );

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = bounds && width > 0 ? width / bounds.w : 0;
  const height = bounds ? Math.round(bounds.h * scale) : 0;

  // Painter: rebuilt when the layout changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    paintRef.current = null;
    if (!canvas || !preview || !bounds || scale <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const accent = getComputedStyle(canvas).getPropertyValue('--accent').trim() || ACCENT_FALLBACK;
    const radius = Math.min(scale * LED_FILL, LED_MAX_DIAMETER) / 2;
    paintRef.current = (rgb: Uint8Array) => {
      lastRef.current = rgb;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < preview.x.length; i++) {
        const cx = (preview.x[i] - bounds.x0) * scale;
        const cy = (preview.y[i] - bounds.y0) * scale;
        const r = rgb[i * 3];
        const g = rgb[i * 3 + 1];
        const b = rgb[i * 3 + 2];
        if (Math.max(r, g, b) > HALO_THRESHOLD) {
          ctx.beginPath();
          ctx.arc(cx, cy, radius * 1.45, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${r},${g},${b},0.22)`;
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${lift(r, UNLIT_FLOOR)},${lift(g, UNLIT_FLOOR)},${lift(b, UNLIT_FLOOR)})`;
        ctx.fill();
        if (i === hoverRef.current) {
          ctx.beginPath();
          ctx.arc(cx, cy, radius + 3, 0, Math.PI * 2);
          ctx.lineWidth = 2;
          ctx.strokeStyle = accent;
          ctx.stroke();
        }
      }
    };
    paintRef.current(lastRef.current ?? new Uint8Array(preview.x.length * 3));
    return () => { paintRef.current = null; };
  }, [preview, bounds, scale, width, height]);

  // Live: paint the card's section of every stream frame.
  useEffect(() => {
    if (!live || !preview) return;
    const n = preview.x.length;
    return subscribeLedFrame(f => {
      const bytes = liveLedBytes(f.devices, frameIndex, n);
      if (bytes) paintRef.current?.(bytes);
    });
  }, [live, preview, frameIndex]);

  // Not live: drop the last stream frame for unlit keys.
  useEffect(() => {
    if (live || !preview) return;
    paintRef.current?.(new Uint8Array(preview.x.length * 3));
  }, [live, preview]);

  const nearest = useCallback((e: MouseEvent<HTMLCanvasElement>): number => {
    if (!preview || !bounds || scale <= 0) return -1;
    const rect = e.currentTarget.getBoundingClientRect();
    const ux = (e.clientX - rect.left) / scale + bounds.x0;
    const uy = (e.clientY - rect.top) / scale + bounds.y0;
    let best = -1;
    let bestDist = HIT_RADIUS;
    for (let i = 0; i < preview.x.length; i++) {
      const d = Math.hypot(preview.x[i] - ux, preview.y[i] - uy);
      if (d <= bestDist) { best = i; bestDist = d; }
    }
    return best;
  }, [preview, bounds, scale]);

  const setHover = (i: number) => {
    if (hoverRef.current === i) return;
    hoverRef.current = i;
    if (lastRef.current) paintRef.current?.(lastRef.current);
  };

  // The service ignores presses while the board is off, so none are sent.
  const handleClick = (e: MouseEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const led = nearest(e);
    if (led >= 0) onPressLed(led);
  };

  // Pointer picks a key; the keyboard has no spatial pick, so Enter / Space
  // fires a random one.
  const handleKey = (e: KeyboardEvent<HTMLCanvasElement>) => {
    if (disabled || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    onPressRandom();
  };

  // The measured box is the plate's content box, so the canvas backing store
  // matches the width it is drawn at.
  return (
    <div className={styles.board}>
      <div ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          style={{ width: '100%', height }}
          role="button"
          tabIndex={0}
          aria-label={label}
          aria-disabled={disabled}
          data-live={live || undefined}
          onClick={handleClick}
          onMouseMove={e => setHover(nearest(e))}
          onMouseLeave={() => setHover(-1)}
          onKeyDown={handleKey}
        />
      </div>
    </div>
  );
}
