import { useCallback, useMemo } from 'react';
import { Select } from '../../../../components/common/Select/Select';
import { useSensors } from '../../../../hooks/useSensors';
import { useSensorExtras } from '../../../../hooks/useSensorExtras';
import { useTranslation } from '../../../../lib/i18n';
import { DECK_MONITORING_CATEGORIES, resolveMonitoringSensor } from '../../deck/deckMonitoring';
import type { DeckMonitoringCategory } from '../../deck/types';
import { buildNicNetworkSensors } from '../networkSensors';
import { CATEGORY_LABEL_KEYS, selectedSensorValue, sensorsForDevice, visibleDeviceKeys } from '../sensorPicker';
import type { HardwareSensor } from '../../../../hooks/useSensors';
import styles from './SensorPicker.module.scss';

export interface SensorSelection {
  category: string;
  sensor: string;
}

/** Live sensor state and a resolver for a stored (category, sensor id) pair. */
export function useSensorLookup() {
  const sensors = useSensors(true);
  const extras = useSensorExtras(true);
  const networkSensors = useMemo(() => buildNicNetworkSensors(extras.nics), [extras.nics]);
  const resolve = useCallback(
    (category: string, sensor: string): HardwareSensor | undefined =>
      resolveMonitoringSensor(sensors, category as DeckMonitoringCategory, sensor, [], networkSensors, extras),
    [sensors, networkSensors, extras],
  );
  return { sensors, extras, networkSensors, resolve };
}

/**
 * The category + sensor Select pair of the monitoring pickers. A stored sensor
 * that this PC does not list shows the placeholder rather than another sensor,
 * and a category change picks that category's first sensor. `onChange` also
 * receives the resolved sensor (undefined while it has no reading) so a caller
 * can derive a default range.
 */
export function SensorPicker({ lookup, category, sensor, onChange, disabled, className, categories, sensorTypes }: {
  /** The caller's own useSensorLookup, so a row subscribes to the sensors once. */
  lookup: ReturnType<typeof useSensorLookup>;
  category: string;
  sensor: string;
  onChange: (selection: SensorSelection, resolved: HardwareSensor | undefined) => void;
  disabled?: boolean;
  className?: string;
  /** Restricts the offered categories. */
  categories?: readonly string[];
  /** Restricts the offered sensors to these sensor types. */
  sensorTypes?: readonly string[];
}) {
  const { t } = useTranslation();
  const { sensors, extras, networkSensors, resolve } = lookup;
  const device = category as DeckMonitoringCategory;
  // FPS has no reading the lighting service can resolve, so it is not offered.
  const categoryOptions = visibleDeviceKeys(DECK_MONITORING_CATEGORIES, device, sensors, networkSensors, extras)
    .filter(c => c !== 'fps' && (!categories || categories.includes(c)))
    .map(c => ({ value: c, label: t(CATEGORY_LABEL_KEYS[c]) }));
  const optionsFor = (d: DeckMonitoringCategory) => {
    const all = sensorsForDevice(sensors, networkSensors, extras, d);
    return sensorTypes ? all.filter(o => o.type !== undefined && sensorTypes.includes(o.type)) : all;
  };
  const sensorOptions = optionsFor(device);
  const listed = sensorOptions.some(o => o.value === sensor || o.sensorName === sensor);
  const sensorValue = listed ? selectedSensorValue(sensorOptions, sensor) : '';

  const pickCategory = (next: string) => {
    const options = optionsFor(next as DeckMonitoringCategory);
    const first = selectedSensorValue(options, '');
    onChange({ category: next, sensor: first }, resolve(next, first));
  };

  return (
    <div className={`${styles.row} ${className ?? ''}`}>
      <Select
        className={styles.category}
        value={category}
        options={categoryOptions}
        onChange={pickCategory}
        disabled={disabled}
        ariaLabel={t('monitoring.settings.device')}
      />
      <Select
        className={styles.sensor}
        value={sensorValue}
        options={sensorOptions}
        placeholder={t('lighting.sensor.unavailable')}
        onChange={next => onChange({ category, sensor: next }, resolve(category, next))}
        disabled={disabled}
        ariaLabel={t('monitoring.settings.sensor')}
      />
    </div>
  );
}
