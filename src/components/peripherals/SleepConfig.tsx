import { useState } from 'react';
import { useTranslation } from '../../lib/i18n';
import { commitSleepIdle } from '../../lib/peripheralBackend';
import type { Peripheral, SleepState } from '../../hooks/usePeripherals';
import styles from './peripherals.module.scss';

interface SleepConfigProps {
  peripheral: Peripheral;
  state: SleepState;
  onChanged: () => void;
}

const PRESETS = [
  { seconds: 60, key: '1min' },
  { seconds: 180, key: '3min' },
  { seconds: 300, key: '5min' },
  { seconds: 600, key: '10min' },
  { seconds: 900, key: '15min' },
];

export function SleepConfig({ peripheral, state, onChanged }: SleepConfigProps) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const set = async (idleSeconds: number) => {
    setPending(true);
    await commitSleepIdle(peripheral, idleSeconds);
    setPending(false);
    onChanged();
  };

  return (
    <div className={styles.row}>
      <div className={styles.labelCol}>
        <span className={styles.label}>{t('peripheral.sleep')}</span>
        <span className={styles.value}>
          {state.idleSeconds > 0 ? `${Math.round(state.idleSeconds / 60)} min` : '-'}
        </span>
      </div>
      <div className={styles.segment}>
        {PRESETS.map(p => (
          <button
            key={p.seconds}
            type="button"
            disabled={pending}
            className={`${styles.segBtn} ${state.idleSeconds === p.seconds ? styles.segBtnActive : ''}`}
            onClick={() => set(p.seconds)}
          >
            {t('peripheral.sleep.' + p.key)}
          </button>
        ))}
      </div>
    </div>
  );
}
