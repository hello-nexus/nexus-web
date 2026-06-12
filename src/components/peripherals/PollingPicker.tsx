import { useTranslation } from '../../lib/i18n';
import { commitPolling } from '../../lib/peripheralBackend';
import type { Peripheral, PollingState } from '../../hooks/usePeripherals';
import styles from './peripherals.module.scss';

interface PollingPickerProps {
  peripheral: Peripheral;
  state: PollingState;
  onChanged: () => void;
}

export function PollingPicker({ peripheral, state, onChanged }: PollingPickerProps) {
  const { t } = useTranslation();
  const set = async (hz: number) => {
    await commitPolling(peripheral, hz);
    onChanged();
  };

  return (
    <div className={styles.row}>
      <div className={styles.labelCol}>
        <span className={styles.label}>{t('peripheral.polling')}</span>
        <span className={styles.value}>{t('peripheral.pollingHz', { hz: state.currentHz })}</span>
      </div>
      <div className={styles.segment}>
        {state.supportedHz.map(hz => (
          <button
            key={hz}
            type="button"
            className={`${styles.segBtn} ${state.currentHz === hz ? styles.segBtnActive : ''}`}
            onClick={() => set(hz)}
          >
            {hz}
          </button>
        ))}
      </div>
    </div>
  );
}
