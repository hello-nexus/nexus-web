import { Minus, Plus } from 'lucide-react';
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
  /** Names the stepper for assistive tech, e.g. which speaker's volume it sets. */
  label?: string;
  /** Vertical (up over value over down, the default) or horizontal (minus, value, plus). */
  orientation?: 'vertical' | 'horizontal';
  /** Zero-pads the value to two digits. Default on; pass false for plain numbers. */
  pad?: boolean;
  onChange?: (value: number) => void;
}

export function Stepper({ value, step = 1, min, max, disabled = false, label, orientation = 'vertical', pad = true, onChange }: StepperProps) {
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
  const horizontal = orientation === 'horizontal';
  const up = (
    <button
      type="button" aria-label={t('common.increment')}
      className={styles.btn}
      style={{ opacity: disabled || atMax ? 0.35 : 1 } as CSSProperties}
      disabled={disabled || atMax}
      onClick={() => emit(value + step)}
    ><span aria-hidden="true">{horizontal ? <Plus size={12} /> : UP}</span></button>
  );
  const down = (
    <button
      type="button" aria-label={t('common.decrement')}
      className={styles.btn}
      style={{ opacity: disabled || atMin ? 0.35 : 1 } as CSSProperties}
      disabled={disabled || atMin}
      onClick={() => emit(value - step)}
    ><span aria-hidden="true">{horizontal ? <Minus size={12} /> : DOWN}</span></button>
  );
  const readout = <span className={styles.value}>{pad ? String(value).padStart(2, '0') : String(value)}</span>;
  return (
    <div className={`${styles.root} ${horizontal ? styles.horizontal : ''}`} role={label ? 'group' : undefined} aria-label={label}>
      {horizontal ? <>{down}{readout}{up}</> : <>{up}{readout}{down}</>}
    </div>
  );
}
