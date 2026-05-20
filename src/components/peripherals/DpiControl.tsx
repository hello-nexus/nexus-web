import { useState } from 'react';
import { useTranslation } from '../../lib/i18n';
import { commitDpi } from '../../lib/peripheralBackend';
import type { Peripheral, DpiState } from '../../hooks/usePeripherals';
import { Slider } from '../common/Slider/Slider';
import styles from './peripherals.module.scss';

/*
 * Mouse DPI control. Uses the canonical Slider primitive in stacked layout,
 * with the device's min/max DPI surfaced under the track and a "DPI" suffix
 * on the value. Drag updates the local preview; pointer release commits via
 * the device API (snapped to step).
 */
export function DpiControl({ peripheral, state, onChanged }: {
  peripheral: Peripheral;
  state: DpiState;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(state.current);
  const [pending, setPending] = useState(false);

  const step = state.step || 50;
  const commit = async () => {
    const snapped = Math.max(state.minDpi, Math.min(state.maxDpi, Math.round(value / step) * step));
    if (snapped === state.current) return;
    setPending(true);
    await commitDpi(peripheral, snapped);
    setPending(false);
    onChanged();
  };

  return (
    <div className={styles.rowFull}>
      <Slider
        orientation="stacked"
        label={t('peripheral.dpi')}
        value={value}
        min={state.minDpi}
        max={state.maxDpi}
        step={step}
        showRange
        formatValue={v => `${v} DPI`}
        disabled={pending}
        onChange={v => setValue(v)}
        onCommit={commit}
      />
    </div>
  );
}
