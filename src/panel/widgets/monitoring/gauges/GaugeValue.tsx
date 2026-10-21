import { splitFormatted } from './format';
import { StableDigits } from '../../common/StableDigits';
import { useFitWidth } from '../../common/useFitWidth';
import styles from './GaugeValue.module.scss';

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
}

const ALIGN_JUSTIFY = { left: 'flex-start', center: 'center', right: 'flex-end' } as const;

// Sensor value+unit line shared by every gauge design. This component IS the
// design's value element: the fit clamp needs the width bounds on the box the
// design positions, and each container it sits in clamps to the gauge width
// for the same reason. role/aria-label keep the per-digit spans from being
// announced one digit at a time.
export function GaugeValue({ formatted, className, clipTopPercent, textFill, align }: GaugeValueProps) {
  const parts = splitFormatted(formatted);
  const { boxRef, contentRef, scale } = useFitWidth();
  return (
    <span
      ref={boxRef}
      className={`${styles.fitBox}${className ? ` ${className}` : ''}`}
      role="img"
      aria-label={formatted}
      style={align ? { justifyContent: ALIGN_JUSTIFY[align] } : undefined}
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
    </span>
  );
}
