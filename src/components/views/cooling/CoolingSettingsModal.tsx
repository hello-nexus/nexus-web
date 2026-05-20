import { useMemo } from 'react';
import type { HardwareSensor } from '../../../hooks/useSensors';
import { useUiSettings } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import {
  defaultCpuTempSensor, defaultGpuTempSensor, listTempSensors,
} from '../../../lib/tempSensorResolver';
import { Overlay } from '../../common/Overlay/Overlay';
import { Select } from '../../common/Select/Select';
import styles from './CoolingSettingsModal.module.scss';

interface CoolingSettingsModalProps {
  open: boolean;
  onClose: () => void;
  cpuSensors: readonly HardwareSensor[];
  gpuSensors: readonly HardwareSensor[];
}

/**
 * Lets the user pin which temperature sensor stands in for "CPU temp" and
 * "GPU temp" everywhere the dashboard reads those values (Cooling page live
 * thermals, Monitoring overview CPU/GPU blocks, Cooling widget, and any
 * PerformanceWidget slot set to the generic "Temperature" type).
 *
 * The dropdown lists every temperature-type sensor on its domain. The sensor
 * the auto-picker would resolve to today is suffixed with "(default)" so the
 * user can tell which one ships out of the box. When no explicit preference
 * is set the dropdown selects that default-marked option; picking it again
 * stays in auto mode (we persist as empty string so future default changes
 * still propagate).
 */
export function CoolingSettingsModal({ open, onClose, cpuSensors, gpuSensors }: CoolingSettingsModalProps) {
  const { t } = useTranslation();
  const { settings, update } = useUiSettings();

  const cpuOptions = useMemo(() => listTempSensors(cpuSensors), [cpuSensors]);
  const gpuOptions = useMemo(() => listTempSensors(gpuSensors), [gpuSensors]);
  const cpuDefault = useMemo(() => defaultCpuTempSensor(cpuSensors), [cpuSensors]);
  const gpuDefault = useMemo(() => defaultGpuTempSensor(gpuSensors), [gpuSensors]);

  if (!open) return null;

  const reset = () => {
    update({ preferredCpuTempSensorId: '', preferredGpuTempSensorId: '' });
  };

  const canReset = settings.preferredCpuTempSensorId !== '' || settings.preferredGpuTempSensorId !== '';

  return (
    <Overlay open={open} onClose={onClose} variant="dialog"
      className={styles.modal} ariaLabel={t('cooling.settings.title')}>
      <h2 className={styles.title}>{t('cooling.settings.title')}</h2>
      <p className={styles.description}>{t('cooling.settings.description')}</p>

      <SensorRow
        label={t('cooling.settings.cpuLabel')}
        options={cpuOptions}
        defaultSensor={cpuDefault}
        defaultSuffix={t('cooling.settings.defaultSuffix')}
        emptyLabel={t('cooling.settings.empty')}
        value={settings.preferredCpuTempSensorId}
        onChange={id => update({ preferredCpuTempSensorId: id })}
      />

      <SensorRow
        label={t('cooling.settings.gpuLabel')}
        options={gpuOptions}
        defaultSensor={gpuDefault}
        defaultSuffix={t('cooling.settings.defaultSuffix')}
        emptyLabel={t('cooling.settings.empty')}
        value={settings.preferredGpuTempSensorId}
        onChange={id => update({ preferredGpuTempSensorId: id })}
      />

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.resetBtn}
          onClick={reset}
          disabled={!canReset}
        >
          {t('cooling.settings.reset')}
        </button>
        <button type="button" className={styles.confirmBtn} onClick={onClose}>
          {t('cooling.settings.close')}
        </button>
      </div>
    </Overlay>
  );
}

interface SensorRowProps {
  label: string;
  options: readonly HardwareSensor[];
  /** Sensor the auto picker would land on. Marked "(default)" in the list. */
  defaultSensor?: HardwareSensor;
  /** Translated " (default)" suffix appended to the default sensor's label. */
  defaultSuffix: string;
  emptyLabel: string;
  /** The stored preference: "" = auto. Use defaultSensor.id as the displayed
   *  selection when empty, so the dropdown shows the user what auto resolves
   *  to right now. */
  value: string;
  onChange: (id: string) => void;
}

function SensorRow({ label, options, defaultSensor, defaultSuffix, emptyLabel, value, onChange }: SensorRowProps) {
  // The visible option list must include both the user's stored pick and the
  // default sensor — otherwise the controlled `<select>` would have a `value`
  // that doesn't match any `<option>` and silently snap to the first one,
  // which would then become the persisted choice on the next user interaction.
  // Two edge cases this defends against:
  //   1. The stored id refers to a sensor that has temporarily dropped off
  //      the live feed (driver restart, hardware swap).
  //   2. The default picker resolves a sensor via its id-fallback chain when
  //      no sensor reports `type === 'Temperature'`; that sensor would not be
  //      in `options` (a strict type-filter list).
  const visibleOptions = useMemo<HardwareSensor[]>(() => {
    const out: HardwareSensor[] = [...options];
    const ids = new Set(out.map(s => s.id));
    if (defaultSensor && !ids.has(defaultSensor.id)) {
      out.unshift(defaultSensor);
      ids.add(defaultSensor.id);
    }
    // If the user previously pinned a sensor that is no longer reporting,
    // surface a synthetic "(unavailable)" row so the controlled select can
    // still display the stored id verbatim. The row is `disabled` so the
    // user can clearly see the stale choice without being able to re-pick it.
    if (value && !ids.has(value)) {
      out.push({
        id: value,
        name: value,
        type: 'Temperature',
        value: 0,
        units: '',
        formatted: '',
        parent: { id: '', name: '' },
      });
    }
    return out;
  }, [options, defaultSensor, value]);

  // When the stored preference is empty (auto), surface the default sensor's
  // id so the dropdown visually selects it. Persisted state stays empty in
  // that case so future default-picker changes propagate automatically.
  const displayedValue = value || defaultSensor?.id || '';

  // Picking the default-marked option resets the preference back to empty
  // string. Picking anything else stores that sensor's id.
  const handleChange = (next: string) => {
    onChange(next === defaultSensor?.id ? '' : next);
  };

  if (visibleOptions.length === 0) {
    return (
      <div className={styles.row}>
        <span className={styles.rowLabel}>{label}</span>
        <span className={styles.empty}>{emptyLabel}</span>
      </div>
    );
  }

  return (
    <label className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <Select
        className={styles.select}
        value={displayedValue}
        onChange={handleChange}
        ariaLabel={label}
      >
        {visibleOptions.map(s => {
          const isDefault = s.id === defaultSensor?.id;
          const isMissing = s.parent.id === '' && s.parent.name === '';
          const suffix = isDefault ? defaultSuffix : '';
          const label = isMissing
            ? `${s.name} (unavailable)`
            : `${s.name} (${s.value.toFixed(1)}°C)${suffix}`;
          return (
            <option key={s.id} value={s.id} disabled={isMissing}>
              {label}
            </option>
          );
        })}
      </Select>
    </label>
  );
}
