import styles from './GaugeTrack.module.scss';

interface GaugeTrackProps {
  // 0-100; clamped here so callers don't have to.
  fillPercent: number;
  className?: string;
}

// Shared accent fill track for bar-style gauges (MicroBar rows, BarGauge
// tiles). Size via custom props on the caller's wrapper:
//   --gauge-track-width  (default 100%)
//   --gauge-track-height (default 5px)
//   --gauge-track-glow   (default 6px)
export function GaugeTrack({ fillPercent, className }: GaugeTrackProps) {
  const clamped = Math.max(0, Math.min(100, fillPercent));
  return (
    <div className={className ? `${styles.track} ${className}` : styles.track}>
      <div className={styles.fill} style={{ width: `${clamped}%` }} />
    </div>
  );
}
