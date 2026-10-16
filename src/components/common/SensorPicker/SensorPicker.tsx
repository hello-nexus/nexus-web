import { useCallback } from 'react';
import { Select } from '../Select/Select';
import { useSensors } from '../../../hooks/useSensors';
import { useSensorExtras } from '../../../hooks/useSensorExtras';
import { useTranslation } from '../../../lib/i18n';
import { DECK_MONITORING_CATEGORIES, resolveMonitoringSensor } from '../../../panel/widgets/deck/deckMonitoring';
import type { DeckMonitoringCategory } from '../../../panel/widgets/deck/types';
import { buildNicNetworkSensors } from '../../../panel/widgets/monitoring/networkSensors';
import { CATEGORY_LABEL_KEYS, selectedSensorValue, sensorsForDevice, visibleDeviceKeys } from '../../../panel/widgets/monitoring/sensorPicker';
import type { HardwareSensor } from '../../../hooks/useSensors';
import styles from './SensorPicker.module.scss';

export interface SensorSelection {
  category: string;
  sensor: string;
}

/** Live sensor state and a resolver for a stored (category, sensor id) pair. */
export function useSensorLookup() {
  const sensors = useSensors(true);
  const extras = useSensorExtras(true);
  const networkSensors = buildNicNetworkSensors(extras.nics);
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
export function SensorPicker({ category, sensor, onChange, disabled, className }: {
  category: string;
  sensor: string;
  onChange: (selection: SensorSelection, resolved: HardwareSensor | undefined) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const { sensors, extras, networkSensors, resolve } = useSensorLookup();
  const device = category as DeckMonitoringCategory;
  const categoryOptions = visibleDeviceKeys(DECK_MONITORING_CATEGORIES, device, sensors, networkSensors, extras)
    .map(c => ({ value: c, label: t(CATEGORY_LABEL_KEYS[c]) }));
  const sensorOptions = sensorsForDevice(sensors, networkSensors, extras, device);
  const listed = sensorOptions.some(o => o.value === sensor || o.sensorName === sensor);
  const sensorValue = listed ? selectedSensorValue(sensorOptions, sensor) : '';

  const pickCategory = (next: string) => {
    const options = sensorsForDevice(sensors, networkSensors, extras, next as DeckMonitoringCategory);
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
