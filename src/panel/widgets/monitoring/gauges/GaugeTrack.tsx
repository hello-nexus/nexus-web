import type { CSSProperties } from 'react';
import { gaugeGradientCss } from '../../../theme/gaugeGradient';
import type { GaugeGradient } from '../valueColor';
import styles from './GaugeTrack.module.scss';

interface GaugeTrackProps {
  // 0-100; clamped here so callers don't have to.
  fillPercent: number;
  className?: string;
  gradient?: GaugeGradient | null;
}

// Shared accent fill track for bar-style gauges (MicroBar rows, BarGauge
// tiles). Size via custom props on the caller's wrapper:
//   --gauge-track-width  (default 100%)
//   --gauge-track-height (default 5px)
//   --gauge-track-glow   (default 6px)
//
// Graded, the fill spans the whole track and is clipped to the reading instead
// of being sized to it, so the ramp stays pinned to the scale: the hot end sits
// at the same place on the track whatever the reading is. The clip also cuts
// the fill's glow at the leading edge.
export function GaugeTrack({ fillPercent, className, gradient }: GaugeTrackProps) {
  const clamped = Math.max(0, Math.min(100, fillPercent));
  const style: CSSProperties = gradient
    ? {
      width: '100%',
      background: gaugeGradientCss(gradient.stops, 90),
      clipPath: `inset(0 ${(100 - clamped).toFixed(2)}% 0 0 round var(--radius-pill))`,
    }
    : { width: `${clamped}%` };
  return (
    <div className={className ? `${styles.track} ${className}` : styles.track}>
      <div className={styles.fill} style={style} />
    </div>
  );
}
