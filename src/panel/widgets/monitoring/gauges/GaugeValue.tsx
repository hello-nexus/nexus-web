import { createContext, useCallback, useContext, useLayoutEffect, useState } from 'react';
import { splitFormatted } from './format';
import { fitValueFontSize, widestReading } from './adaptiveValueSize';
import { StableDigits } from '../../common/StableDigits';
import { useFitWidth } from '../../common/useFitWidth';
import styles from './GaugeValue.module.scss';

// Per-widget option: on lets a value grow to the space its slot has. Off (the
// default) leaves every design's own size untouched.
export const AdaptiveNumbersContext = createContext(false);

const SLOT_SELECTOR = '[data-monitoring-slot-index]';

// Measured on size change and when web fonts finish loading, never per tick.
// The reserved reading is rendered in a hidden twin of the line, so digit
// cells, letter-spacing and the smaller unit span are measured as drawn.
function useAdaptiveSize(
  enabled: boolean,
  box: HTMLElement | null,
  twin: HTMLElement | null,
  innerFraction: number | undefined,
  unit: string,
) {
  const [size, setSize] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    if (!enabled || !box || !twin) {
      setSize(undefined);
      return undefined;
    }
    const slot = box.closest<HTMLElement>(SLOT_SELECTOR);
    if (!slot) return undefined;
    let live = true;
    const update = () => {
      if (!live) return;
      const current = parseFloat(getComputedStyle(box).fontSize);
      // The design's own size is the floor: read it with the override lifted (no paint between).
      const held = box.style.fontSize;
      box.style.fontSize = '';
      const base = parseFloat(getComputedStyle(box).fontSize);
      box.style.fontSize = held;
      if (!(current > 0) || !(base > 0)) return;
      setSize(fitValueFontSize(slot.clientWidth, slot.clientHeight, twin.offsetWidth / current, base, innerFraction));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(slot);
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    fonts?.addEventListener?.('loadingdone', update);
    void fonts?.ready?.then(update);
    return () => {
      live = false;
      ro.disconnect();
      fonts?.removeEventListener?.('loadingdone', update);
    };
  }, [enabled, box, twin, innerFraction, unit]);
  return size;
}

interface GaugeValueProps {
  formatted: string;
  // The design's own value class (font size, weight, color, placement).
  className?: string;
  // Percentage of the reading clipped from the top, for the fill designs. It
  // rides the same element as the fit transform, so the fill line tracks the
  // glyphs when an over-wide reading is scaled down.
  clipTopPercent?: number;
  /** A CSS image painted through the glyphs (background-clip: text). */
  textFill?: string;
  /** Pins the line (and its fit scale origin) to an edge; omitted keeps it centered. */
  align?: 'left' | 'center' | 'right';
  /** For a value drawn inside a ring: the share of the slot's short side it may span. */
  innerFraction?: number;
}

const ALIGN_JUSTIFY = { left: 'flex-start', center: 'center', right: 'flex-end' } as const;

// Sensor value+unit line shared by every gauge design. This component IS the
// design's value element: the fit clamp needs the width bounds on the box the
// design positions, and each container it sits in clamps to the gauge width
// for the same reason. role/aria-label keep the per-digit spans from being
// announced one digit at a time.
export function GaugeValue({ formatted, className, clipTopPercent, textFill, align, innerFraction }: GaugeValueProps) {
  const parts = splitFormatted(formatted);
  const { boxRef, contentRef, scale } = useFitWidth();
  const adaptive = useContext(AdaptiveNumbersContext);
  const [boxEl, setBoxEl] = useState<HTMLElement | null>(null);
  const [twinEl, setTwinEl] = useState<HTMLElement | null>(null);
  const fontSize = useAdaptiveSize(adaptive, boxEl, twinEl, innerFraction, parts.unit);
  const setBox = useCallback((el: HTMLElement | null) => {
    boxRef(el);
    setBoxEl(el);
  }, [boxRef]);
  return (
    <span
      ref={setBox}
      className={`${styles.fitBox}${className ? ` ${className}` : ''}`}
      role="img"
      aria-label={formatted}
      data-skin-part="value"
      style={{ ...(align ? { justifyContent: ALIGN_JUSTIFY[align] } : undefined), ...(fontSize ? { fontSize: `${fontSize}px` } : undefined) }}
    >
      <span
        ref={contentRef}
        className={styles.line}
        style={{
          transform: `scale(${scale})`,
          transformOrigin: align,
          clipPath: clipTopPercent === undefined ? undefined : `inset(${clipTopPercent}% 0 0 0)`,
          ...(textFill ? { backgroundImage: textFill, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' } : undefined),
        }}
      >
        <StableDigits text={parts.value} />
        {parts.unit && <span className="panel-gauge-unit">{parts.unit}</span>}
      </span>
      {adaptive && (
        <span ref={setTwinEl} className={styles.twin} aria-hidden="true">
          <StableDigits text={widestReading(parts.unit)} />
          {parts.unit && <span className="panel-gauge-unit">{parts.unit}</span>}
        </span>
      )}
    </span>
  );
}
