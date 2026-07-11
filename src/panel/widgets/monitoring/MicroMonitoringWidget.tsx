import { useSensors } from '../../../hooks/useSensors';
import { useSensorExtras } from '../../../hooks/useSensorExtras';
import { useFpsSensors } from '../../../hooks/useFpsSensors';
import { useNetworkMonitor } from '../../../hooks/useNetworkMonitor';
import { useTempSensorPrefs, useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { useSharedSensorHistory } from '../common/useSharedSensorHistory';
import type { PanelWidget } from '../../types';
import {
  buildNetworkSensors,
  networkMaxValue,
  NETWORK_SENSOR_TOTAL,
} from './networkSensors';
import { isExtrasBackedDevice, type DeviceKey } from './perfSlots';
import {
  percentForSensor,
  resolveSensor,
  staticMaxForDevice,
} from './MonitoringWidget';
import { bareSensorLabel } from './sensorNames';
import { HoverTooltip } from '../../../components/common/HoverTooltip/HoverTooltip';
import { MicroBar } from './MicroBar';
import { formatSensorValue } from './sensorValueFormat';
import type { NumberFormat, TempUnit } from '../../../lib/units';
import styles from './MicroMonitoringWidget.module.scss';

interface MicroMonitoringWidgetProps {
  widget: PanelWidget;
  count: number;
}

// Micro mode persists in its own keyspace (`micro_device`, `micro_sensorN`)
// so toggling between Micro and multi-sensor modes never mutates the other
// mode's per-slot configuration.
function readMicroDevice(widget: PanelWidget): DeviceKey {
  return ((widget.config?.micro_device as DeviceKey | undefined) ?? 'cpu');
}

function readMicroSensorName(widget: PanelWidget, index: number): string {
  return ((widget.config?.[`micro_sensor${index}`] as string | undefined) ?? '');
}

// quick/cpu/gpu/memory/motherboard/fan/storage/network/fps stay plain
// literals, not routed through i18n (mirrors MonitoringWidget's
// labelForDevice). The SMART and extras-topic categories route through
// the DetailedTab family-title keys instead, since this bottom label is
// the widget's always-visible primary device caption, not a rare fallback.
export function bottomLabelForDevice(
  device: DeviceKey,
  sensors: ReturnType<typeof useSensors>,
  t: (key: string) => string,
): string {
  switch (device) {
    case 'quick': return 'Quick';
    case 'cpu': return sensors.cpuModel || 'CPU';
    case 'gpu': return sensors.gpuModel || 'GPU';
    case 'memory': return sensors.memoryTotal ? `RAM | ${sensors.memoryTotal}` : 'RAM';
    case 'motherboard': return sensors.motherboardModel || 'Motherboard';
    case 'fan': return sensors.motherboardModel || 'Fan';
    case 'storage': return 'Storage';
    case 'smart': return t('monitoring.settings.category.smart');
    case 'memoryModule': return t('monitoring.detailed.memoryModule');
    case 'battery': return t('monitoring.detailed.battery');
    case 'cooler': return t('monitoring.detailed.cooler');
    case 'psu': return t('monitoring.detailed.psu');
    case 'embeddedController': return t('monitoring.detailed.ec');
    case 'network': return 'Network';
    case 'fps': return 'FPS';
  }
}

export function MicroMonitoringWidget({ widget, count }: MicroMonitoringWidgetProps) {
  const { t } = useTranslation();
  const device = readMicroDevice(widget);
  const sensorNames = Array.from({ length: count }, (_, i) => readMicroSensorName(widget, i));

  const usesFps = device === 'fps';
  const usesNetwork = device === 'network';
  const usesExtras = isExtrasBackedDevice(device);
  const sensors = useSensors(true);
  const fpsSensors = useFpsSensors(usesFps);
  const network = useNetworkMonitor(usesNetwork);
  const networkSensors = buildNetworkSensors(network);
  const extras = useSensorExtras(usesExtras);
  const tempPrefs = useTempSensorPrefs();
  const { monitoringTempUnit, numberFormat } = useUnitPrefs();

  // The bottom device caption ("GPU") is the widget's category label: a custom
  // micro_category overrides the derived name, micro_categoryHidden drops the
  // whole caption row and lets the bars fill the freed height.
  const categoryOverride = (widget.config?.micro_category as string | undefined)?.trim();
  const categoryHidden = widget.config?.micro_categoryHidden === true;
  const bottomLabel = categoryOverride || bottomLabelForDevice(device, sensors, t);

  return (
    <div className={styles.micro}>
      <div className={styles.rows}>
        {sensorNames.map((rawName, i) => (
          <MicroRow
            key={`${i}-${device}-${rawName}`}
            sensors={sensors}
            fpsSensors={fpsSensors}
            networkSensors={networkSensors}
            extras={extras}
            device={device}
            sensorName={rawName}
            labelOverride={widget.config?.[`micro_sensor${i}_label`] as string | undefined}
            labelHidden={widget.config?.[`micro_sensor${i}_labelHidden`] === true}
            tempPrefs={tempPrefs}
            monitoringTempUnit={monitoringTempUnit}
            numberFormat={numberFormat}
          />
        ))}
      </div>
      {!categoryHidden && (
        <HoverTooltip body={bottomLabel} side="top">
          <div className={styles.bottomLabel}>{bottomLabel}</div>
        </HoverTooltip>
      )}
    </div>
  );
}

interface MicroRowProps {
  sensors: ReturnType<typeof useSensors>;
  fpsSensors: ReturnType<typeof useFpsSensors>;
  networkSensors: ReturnType<typeof buildNetworkSensors>;
  extras: ReturnType<typeof useSensorExtras>;
  device: DeviceKey;
  sensorName: string;
  labelOverride?: string;
  labelHidden?: boolean;
  tempPrefs?: { cpuId: string; gpuId: string };
  monitoringTempUnit: TempUnit;
  numberFormat: NumberFormat;
}

function MicroRow({ sensors, fpsSensors, networkSensors, extras, device, sensorName, labelOverride, labelHidden = false, tempPrefs, monitoringTempUnit, numberFormat }: MicroRowProps) {
  const effectiveSensorName = device === 'network' && !sensorName ? NETWORK_SENSOR_TOTAL : sensorName;
  const sensor = resolveSensor(sensors, fpsSensors, networkSensors, device, effectiveSensorName, tempPrefs, extras);
  const rawValue = sensor?.value ?? 0;
  const formatted = sensor ? formatSensorValue(sensor.value, sensor.units, sensor.formatted, monitoringTempUnit, numberFormat) : '-';
  const sensorDisplayName = sensor?.name ?? '';
  const autoLabel = bareSensorLabel(device, sensorDisplayName) || sensorDisplayName || effectiveSensorName;
  const label = labelHidden ? '' : (labelOverride?.trim() || autoLabel);
  const sensorKey = `${device}::${effectiveSensorName || 'default'}`;
  const history = useSharedSensorHistory(sensorKey, rawValue) as number[];
  const maxValue = device === 'network'
    ? networkMaxValue(rawValue, history)
    : staticMaxForDevice(device, sensor?.name, sensor?.type);
  const fillPercent = percentForSensor(device, sensor, maxValue);

  return <MicroBar label={label} formatted={formatted} fillPercent={fillPercent} />;
}
