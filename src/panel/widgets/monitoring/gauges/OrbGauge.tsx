import { GaugeValue } from './GaugeValue';
import type { GaugeProps } from './types';
import styles from './OrbGauge.module.scss';

// Round-tile design: the glass itself is the vessel, filling bottom-up.
// Full-bleed (ROUND_FULL_BLEED_DESIGNS) - the disc here is the same box the
// round card masks, so its own 50% radius lands exactly on the card's edge and
// no JS measure is needed to keep it circular.
export function OrbGauge({ value, formatted, label }: GaugeProps) {
  const fillPercent = Math.max(0, Math.min(100, value));

  return (
    <div className={styles.orb}>
      <div className={styles.vessel}>
        <div className={styles.fill} style={{ height: `${fillPercent}%` }} />
      </div>
      <div className={styles.overlay}>
        <GaugeValue formatted={formatted} className={styles.value} />
        {label && <span className={styles.label}>{label}</span>}
      </div>
    </div>
  );
}

export default OrbGauge;
