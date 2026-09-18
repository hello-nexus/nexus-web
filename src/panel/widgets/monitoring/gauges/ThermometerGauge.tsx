import { GaugeValue } from './GaugeValue';
import type { GaugeProps } from './types';
import { gaugeGradientCss } from '../../../theme/gaugeGradient';
import styles from './ThermometerGauge.module.scss';

export function ThermometerGauge({ value, formatted, label, gradient }: GaugeProps) {
  const fillPercent = Math.max(0, Math.min(100, value));
  // Graded, the fill spans the tube and is clipped to the reading, so the
  // ramp stays pinned to the scale rather than stretching with the level.
  const fillStyle = gradient
    ? { height: '100%', background: gaugeGradientCss(gradient.stops, 0), clipPath: `inset(${(100 - fillPercent).toFixed(2)}% 0 0 0)` }
    : { height: `${fillPercent}%` };

  return (
    <div className={styles.thermo}>
      <div className={styles.tubeWrap}>
        <div className={styles.tube}>
          <div className={styles.fill} style={fillStyle} />
        </div>
      </div>
      <div className={styles.info}>
        <GaugeValue formatted={formatted} className={styles.value} />
        {label && <span className={styles.label}>{label}</span>}
      </div>
    </div>
  );
}

export default ThermometerGauge;
