import { GaugeValue } from './GaugeValue';
import type { GaugeProps } from './types';
import { gaugeGradientColorAt, hexWithAlpha } from '../../../theme/gaugeGradient';
import styles from './MicrobarsGauge.module.scss';

export function MicrobarsGauge({ formatted, label, history, gradient }: GaugeProps) {
  const bars = history.slice(-10);
  while (bars.length < 10) bars.unshift(0);

  return (
    <div className={styles.microbars}>
      <div className={styles.barGroup}>
        {bars.map((val, i) => {
          const height = Math.max(4, Math.min(100, val));
          // A bar takes the gradient's colour at its own sample.
          const color = gradient ? gaugeGradientColorAt(gradient.stops, height / 100) : null;
          return (
            <div
              key={i}
              className={styles.bar}
              style={gradient && color
                ? { height: `${height}%`, background: hexWithAlpha(color, gradient.bodyAlpha), borderTopColor: color }
                : { height: `${height}%` }}
            />
          );
        })}
      </div>
      <div className={styles.info}>
        <GaugeValue formatted={formatted} className={styles.value} />
        {label && <span className={styles.label}>{label}</span>}
      </div>
    </div>
  );
}

export default MicrobarsGauge;
