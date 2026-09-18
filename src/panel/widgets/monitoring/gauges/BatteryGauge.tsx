import { GaugeValue } from './GaugeValue';
import type { GaugeProps } from './types';
import { gaugeGradientCss } from '../../../theme/gaugeGradient';
import styles from './BatteryGauge.module.scss';

export function BatteryGauge({ value, formatted, label, gradient }: GaugeProps) {
  const fillPercent = Math.max(0, Math.min(100, value));
  const fillStyle = gradient
    ? { width: '100%', background: gaugeGradientCss(gradient.stops, 90), clipPath: `inset(0 ${(100 - fillPercent).toFixed(2)}% 0 0)` }
    : { width: `${fillPercent}%` };

  return (
    <div className={styles.battery}>
      <div className={styles.shellWrap}>
        <div className={styles.shell}>
          <div className={styles.fill} style={fillStyle} />
        </div>
        <div className={styles.cap} />
      </div>
      <div className={styles.info}>
        <GaugeValue formatted={formatted} className={styles.value} />
        {label && <span className={styles.label}>{label}</span>}
      </div>
    </div>
  );
}

export default BatteryGauge;
