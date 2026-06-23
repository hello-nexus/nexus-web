import type { CSSProperties } from 'react';
import { useTranslation } from '../../../lib/i18n';
import styles from './Stepper.module.scss';

const UP = '▲';
const DOWN = '▼';

export interface StepperProps {
  value: number;
  step?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  onChange?: (value: number) => void;
}

export function Stepper({ value, step = 1, min, max, disabled = false, onChange }: StepperProps) {
  const { t } = useTranslation();
  const atMax = max != null && value >= max;
  const atMin = min != null && value <= min;
  const emit = (next: number) => {
    if (!onChange) return;
    let v = next;
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    onChange(v);
  };
  return (
    <div className={styles.root}>
      <button
        type="button" aria-label={t('common.increment')}
        className={styles.btn}
        style={{ opacity: disabled || atMax ? 0.35 : 1 } as CSSProperties}
        disabled={disabled || atMax}
        onClick={() => emit(value + step)}
      ><span aria-hidden="true">{UP}</span></button>
      <span className={styles.value}>{String(value).padStart(2, '0')}</span>
      <button
        type="button" aria-label={t('common.decrement')}
        className={styles.btn}
        style={{ opacity: disabled || atMin ? 0.35 : 1 } as CSSProperties}
        disabled={disabled || atMin}
        onClick={() => emit(value - step)}
      ><span aria-hidden="true">{DOWN}</span></button>
    </div>
  );
}
