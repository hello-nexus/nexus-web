import { GaugeValue } from './GaugeValue';
import type { GaugeProps } from './types';
import styles from './MicrobarsGauge.module.scss';

export function MicrobarsGauge({ formatted, label, history }: GaugeProps) {
  const bars = history.slice(-10);
  while (bars.length < 10) bars.unshift(0);

  return (
    <div className={styles.microbars}>
      <div className={styles.barGroup}>
        {bars.map((val, i) => (
          <div
            key={i}
            className={styles.bar}
            style={{ height: `${Math.max(4, Math.min(100, val))}%` }}
          />
        ))}
      </div>
      <div className={styles.info}>
        <GaugeValue formatted={formatted} className={styles.value} />
        {label && <span className={styles.label}>{label}</span>}
      </div>
    </div>
  );
}

export default MicrobarsGauge;
