import { useSensors } from '../../../hooks/useSensors';
import { useFpsSensors } from '../../../hooks/useFpsSensors';
import { useNetworkMonitor } from '../../../hooks/useNetworkMonitor';
import { useTempSensorPrefs } from '../../../hooks/useUiSettings';
import { useSharedSensorHistory } from '../common/useSharedSensorHistory';
import type { PanelWidget } from '../../types';
import {
  buildNetworkSensors,
  networkMaxValue,
  NETWORK_SENSOR_TOTAL,
} from './networkSensors';
import type { DeviceKey } from './perfSlots';
import {
  percentForSensor,
  resolveSensor,
  staticMaxForDevice,
} from './MonitoringWidget';
import { bareSensorLabel } from './sensorNames';
import { HoverTooltip } from '../../../components/common/HoverTooltip/HoverTooltip';
import { MicroBar } from './MicroBar';
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

function bottomLabelForDevice(
  device: DeviceKey,
  sensors: ReturnType<typeof useSensors>,
): string {
  switch (device) {
    case 'quick': return 'Quick';
    case 'cpu': return sensors.cpuModel || 'CPU';
    case 'gpu': return sensors.gpuModel || 'GPU';
    case 'memory': return sensors.memoryTotal ? `RAM | ${sensors.memoryTotal}` : 'RAM';
    case 'motherboard': return sensors.motherboardModel || 'Motherboard';
    case 'fan': return sensors.motherboardModel || 'Fan';
    case 'storage': return 'Storage';
    case 'network': return 'Network';
    case 'fps': return 'FPS';
  }
}

export function MicroMonitoringWidget({ widget, count }: MicroMonitoringWidgetProps) {
  const device = readMicroDevice(widget);
  const sensorNames = Array.from({ length: count }, (_, i) => readMicroSensorName(widget, i));

  const usesFps = device === 'fps';
  const usesNetwork = device === 'network';
  const sensors = useSensors(true);
  const fpsSensors = useFpsSensors(usesFps);
  const network = useNetworkMonitor(usesNetwork);
  const networkSensors = buildNetworkSensors(network);
  const tempPrefs = useTempSensorPrefs();

  const bottomLabel = bottomLabelForDevice(device, sensors);

  return (
    <div className={styles.micro}>
      <div className={styles.rows}>
        {sensorNames.map((rawName, i) => (
          <MicroRow
            key={`${i}-${device}-${rawName}`}
            sensors={sensors}
            fpsSensors={fpsSensors}
            networkSensors={networkSensors}
            device={device}
            sensorName={rawName}
            tempPrefs={tempPrefs}
          />
        ))}
      </div>
      <HoverTooltip body={bottomLabel} side="top">
        <div className={styles.bottomLabel}>{bottomLabel}</div>
      </HoverTooltip>
    </div>
  );
}

interface MicroRowProps {
  sensors: ReturnType<typeof useSensors>;
  fpsSensors: ReturnType<typeof useFpsSensors>;
  networkSensors: ReturnType<typeof buildNetworkSensors>;
  device: DeviceKey;
  sensorName: string;
  tempPrefs?: { cpuId: string; gpuId: string };
}

function MicroRow({ sensors, fpsSensors, networkSensors, device, sensorName, tempPrefs }: MicroRowProps) {
  const effectiveSensorName = device === 'network' && !sensorName ? NETWORK_SENSOR_TOTAL : sensorName;
  const sensor = resolveSensor(sensors, fpsSensors, networkSensors, device, effectiveSensorName, tempPrefs);
  const rawValue = sensor?.value ?? 0;
  const formatted = sensor?.formatted ?? '-';
  const sensorDisplayName = sensor?.name ?? '';
  const label = bareSensorLabel(device, sensorDisplayName) || sensorDisplayName || effectiveSensorName;
  const sensorKey = `${device}::${effectiveSensorName || 'default'}`;
  const history = useSharedSensorHistory(sensorKey, rawValue) as number[];
  const maxValue = device === 'network'
    ? networkMaxValue(rawValue, history)
    : staticMaxForDevice(device, sensor?.name, sensor?.type);
  const fillPercent = percentForSensor(device, sensor, maxValue);

  return <MicroBar label={label} formatted={formatted} fillPercent={fillPercent} />;
}
