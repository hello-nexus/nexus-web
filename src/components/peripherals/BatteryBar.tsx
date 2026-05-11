import { useTranslation } from '../../lib/i18n';
import type { BatteryState } from '../../hooks/usePeripherals';
import styles from './peripherals.module.scss';

export function BatteryBar({ state }: { state: BatteryState }) {
  const { t } = useTranslation();
  const pct = Math.max(0, Math.min(100, state.percent));
  const tone = pct >= 50 ? 'good' : pct >= 20 ? 'warn' : 'bad';

  return (
    <div className={styles.row}>
      <div className={styles.labelCol}>
        <span className={styles.label}>{t('peripheral.battery')}</span>
        <span className={styles.value}>
          {pct >= 0 ? `${pct}%` : '—'} {state.charging && <span className={styles.charging}>⚡</span>}
        </span>
      </div>
      <div className={styles.batteryOuter}>
        <div
          className={`${styles.batteryFill} ${styles['batteryFill_' + tone]}`}
          style={{ width: pct >= 0 ? `${pct}%` : '0%' }}
        />
      </div>
    </div>
  );
}
