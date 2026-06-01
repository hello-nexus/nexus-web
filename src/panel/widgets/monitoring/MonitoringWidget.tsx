// resolveSensor/labelForDevice/staticMaxForDevice/percentForSensor are the
// pure helpers MonitoringWidget and PerfSlot use, not consumed elsewhere.
 
import { useMemo } from 'react';
import { useSensors } from '../../../hooks/useSensors';
import type { HardwareSensor } from '../../../hooks/useSensors';
import { useFpsSensors } from '../../../hooks/useFpsSensors';
import { useNetworkMonitor } from '../../../hooks/useNetworkMonitor';
import { useTempSensorPrefs } from '../../../hooks/useUiSettings';
import { resolveCpuTempSensor, resolveGpuTempSensor } from '../../../lib/tempSensorResolver';
import type { WidgetProps } from '../types';
import { useSharedSensorHistory } from '../common/useSharedSensorHistory';
import { GAUGE_DESIGNS } from './gauges';
import type { GaugeDesignKey, GaugeProps } from './gauges';
import { DEFAULT_SLOTS, isMicroLayout, resolvedSlotCountForSize } from './perfSlots';
import type { DeviceKey } from './perfSlots';
import { prefixedSensorLabel } from './sensorNames';
import { MicroMonitoringWidget } from './MicroMonitoringWidget';
import { buildNetworkSensors, networkMaxValue, NETWORK_SENSOR_TOTAL } from './networkSensors';
import { chartDomainForScale, DEFAULT_SCALE_MODE, type ScaleMode } from './perfDomain';
import styles from './MonitoringWidget.module.scss';

interface TempSensorPrefs {
  cpuId: string;
  gpuId: string;
}

/**
 * Resolve a sensor given a device category and sensor name. For fan with no
 * sensor name, picks the first fan sensor.
 *
 * For CPU/GPU slots, sensorName "Temperature" (the generic type flag) defers
 * to the global preferred-temp-sensor setting; an explicit named sensor (e.g.
 * "CPU Package", "GPU Hot Spot") is used as-is.
 */
export function resolveSensor(
  sensors: ReturnType<typeof useSensors>,
  fpsSensors: HardwareSensor[],
  networkSensors: HardwareSensor[],
  device: DeviceKey,
  sensorName: string,
  tempPrefs?: TempSensorPrefs,
): HardwareSensor | undefined {
  switch (device) {
    case 'cpu':
      if (sensorName === 'Temperature') {
        return resolveCpuTempSensor(sensors.cpu, tempPrefs?.cpuId ?? '');
      }
      return sensorName
        ? sensors.cpu.find(s => s.name === sensorName) ?? sensors.cpu.find(s => s.name === 'CPU Total')
        : sensors.cpu.find(s => s.name === 'CPU Total') ?? sensors.cpu[0];
    case 'gpu':
      if (sensorName === 'Temperature') {
        return resolveGpuTempSensor(sensors.gpu, tempPrefs?.gpuId ?? '');
      }
      return sensorName
        ? sensors.gpu.find(s => s.name === sensorName || (s.name === 'GPU Core' && s.type === sensorName))
          ?? sensors.gpu.find(s => s.name === 'GPU Core' && s.type === 'Load')
          ?? sensors.gpu[0]
        : sensors.gpu.find(s => s.name === 'GPU Core' && s.type === 'Load') ?? sensors.gpu[0];
    case 'memory':
      return sensorName
        ? sensors.memory.find(s => s.name === sensorName) ?? sensors.memory.find(s => s.name === 'Memory Usage')
        : sensors.memory.find(s => s.name === 'Memory Usage') ?? sensors.memory[0];
    case 'fan':
      return sensorName
        ? sensors.motherboard.find(s => s.type === 'Fan' && s.name === sensorName)
          ?? sensors.motherboard.find(s => s.type === 'Fan')
        : sensors.motherboard.find(s => s.type === 'Fan');
    case 'storage':
      return sensors.storageSensors.find(s => s.name === sensorName) ?? sensors.storageSensors[0];
    case 'network':
      return sensorName
        ? networkSensors.find(s => s.name === sensorName) ?? networkSensors.find(s => s.name === NETWORK_SENSOR_TOTAL)
        : networkSensors.find(s => s.name === NETWORK_SENSOR_TOTAL);
    case 'fps':
      return sensorName
        ? fpsSensors.find(s => s.name === sensorName)
        : fpsSensors[0];
    default:
      return undefined;
  }
}

export function labelForDevice(device: DeviceKey, sensorName: string): string {
  if (sensorName) return prefixedSensorLabel(device, sensorName);
  switch (device) {
    case 'cpu': return 'CPU';
    case 'gpu': return 'GPU';
    case 'memory': return 'RAM';
    case 'fan': return 'FAN';
    case 'storage': return 'Storage';
    case 'network': return 'Network';
    case 'fps': return 'FPS';
  }
}

export function staticMaxForDevice(device: DeviceKey, sensorName?: string): number {
  if (device === 'fan') return 2500;
  if (device === 'storage') return 100;
  if (device === 'fps') return sensorName === 'Frame Time' ? 50 : 240;
  // Load/temperature/clock sensors: percentage max.
  return 100;
}

export function percentForSensor(device: DeviceKey, sensor: HardwareSensor | undefined, maxValue: number): number {
  if (!sensor) return 0;
  // Prefer the sensor's own ceiling when present. Memory Used / VRAM Used on
  // Windows LHM are Data sensors in GB (not %), with installed capacity in
  // `theoreticalMaximum`; without this branch the gauge treats 9.76 GB as
  // 9.76% on a 32 GB box.
  if (sensor.theoreticalMaximum && sensor.theoreticalMaximum > 0) {
    return Math.max(0, Math.min(100, (sensor.value / sensor.theoreticalMaximum) * 100));
  }
  if (device === 'fan' || device === 'network' || device === 'fps') {
    return Math.min(100, (sensor.value / maxValue) * 100);
  }
  // Load sensors already report 0-100 percent.
  return Math.max(0, Math.min(100, sensor.value));
}

export function MonitoringWidget({ widget, selectedSlot, onSelectSlot }: WidgetProps) {
  const count = resolvedSlotCountForSize(widget.size, widget.config?.slotCount as number | undefined);
  const isMicro = isMicroLayout(widget.size, count);

  // Slot configs for both modes. In Micro mode the slot{N}_* keys are read
  // only to decide whether the lazy fps/network hooks need to subscribe; the
  // render path ignores them.
  const slotConfigs = Array.from({ length: count }, (_, i) => ({
    device: ((widget.config?.[`slot${i}_device`] as DeviceKey | undefined) ?? DEFAULT_SLOTS[i]?.device ?? 'cpu'),
    sensorName: ((widget.config?.[`slot${i}_sensor`] as string | undefined) ?? DEFAULT_SLOTS[i]?.sensor ?? ''),
    design: ((widget.config?.[`slot${i}_design`] as GaugeDesignKey | undefined) ?? DEFAULT_SLOTS[i]?.design ?? 'sparkline'),
    scale: ((widget.config?.[`slot${i}_scale`] as ScaleMode | undefined) ?? DEFAULT_SCALE_MODE),
  }));
  const microDevice = widget.config?.micro_device as DeviceKey | undefined;
  const usesFps = isMicro
    ? microDevice === 'fps'
    : slotConfigs.some(slot => slot.device === 'fps');
  const usesNetwork = isMicro
    ? microDevice === 'network'
    : slotConfigs.some(slot => slot.device === 'network');
  // Call hooks unconditionally (no branch, no early return) or the hooks-order
  // guard trips when slot count toggles between Micro (3/4) and multi (1/2/4).
  const sensors = useSensors(true);
  const fpsSensors = useFpsSensors(usesFps);
  const network = useNetworkMonitor(usesNetwork);
  const networkSensors = buildNetworkSensors(network);
  const tempPrefs: TempSensorPrefs = useTempSensorPrefs();

  if (isMicro) {
    return <MicroMonitoringWidget widget={widget} count={count} />;
  }

  const selectable = typeof onSelectSlot === 'function';
  const activeSlot = selectedSlot == null
    ? 0
    : Math.max(0, Math.min(selectedSlot, count - 1));

  const layoutClass = count >= 4 ? styles.grid2x2
    : count === 2 && (widget.size === '4x4' || widget.size === '2x4') ? styles.grid2row
    : count === 2 ? styles.grid2col
    : styles.solo;

  return (
    <div className={`${styles.performance} ${layoutClass}`}>
      {slotConfigs.map(({ device, sensorName, design, scale }, i) => {
        return (
          <PerfSlot
            key={`${i}-${device}-${sensorName}`}
            slotIndex={i}
            sensors={sensors}
            fpsSensors={fpsSensors}
            networkSensors={networkSensors}
            device={device}
            sensorName={sensorName}
            design={design}
            scale={scale}
            tempPrefs={tempPrefs}
            selected={selectable && i === activeSlot}
            onSelect={selectable ? () => onSelectSlot?.(i) : undefined}
          />
        );
      })}
    </div>
  );
}

interface PerfSlotProps {
  slotIndex?: number;
  sensors: ReturnType<typeof useSensors>;
  fpsSensors: HardwareSensor[];
  networkSensors: HardwareSensor[];
  device: DeviceKey;
  sensorName: string;
  design: GaugeDesignKey;
  scale?: ScaleMode;
  tempPrefs?: TempSensorPrefs;
  selected?: boolean;
  onSelect?: () => void;
}

export function PerfSlot({ slotIndex, sensors, fpsSensors, networkSensors, device, sensorName, design, scale = DEFAULT_SCALE_MODE, tempPrefs, selected = false, onSelect }: PerfSlotProps) {
  const effectiveSensorName = device === 'network' && !sensorName ? NETWORK_SENSOR_TOTAL : sensorName;
  const sensor = resolveSensor(sensors, fpsSensors, networkSensors, device, effectiveSensorName, tempPrefs);
  const rawValue = sensor?.value ?? 0;
  const formatted = sensor?.formatted ?? '-';
  const label = labelForDevice(device, effectiveSensorName);
  // Shared key so the tile + immersive instance for the same sensor share one
  // 60-sample buffer; re-mounting in immersive shows existing history at once.
  const sensorKey = `${device}::${effectiveSensorName || 'default'}`;
  const history = useSharedSensorHistory(sensorKey, rawValue) as number[];
  const sensorMax = sensor?.theoreticalMaximum && sensor.theoreticalMaximum > 0 ? sensor.theoreticalMaximum : 0;
  const maxValue = device === 'network'
    ? networkMaxValue(rawValue, history)
    : sensorMax || staticMaxForDevice(device, sensor?.name);
  const value = percentForSensor(device, sensor, maxValue);
  const [domainMin, domainMax] = chartDomainForScale(device, rawValue, history, maxValue, scale, sensor?.name);
  // Stable tuple reference so the Sparkline path-memo keys on bound values,
  // not array identity.
  const historyDomain = useMemo<[number, number]>(() => [domainMin, domainMax], [domainMin, domainMax]);

  const GaugeComponent = GAUGE_DESIGNS[design] ?? GAUGE_DESIGNS.sparkline;

  const props: GaugeProps = {
    value,
    rawValue,
    formatted,
    label,
    history,
    maxValue,
    historyDomain,
  };

  const content = <GaugeComponent {...props} />;

  if (!onSelect) {
    return <div className={styles.slot} data-monitoring-slot-index={slotIndex}>{content}</div>;
  }

  return (
    <button
      type="button"
      data-monitoring-slot-index={slotIndex}
      className={`${styles.slot} ${styles.slotSelectable} ${selected ? styles.slotSelected : ''}`}
      aria-pressed={selected}
      aria-label={`Select ${label}`}
      onClick={event => {
        event.stopPropagation();
        onSelect();
      }}
      onPointerDown={event => event.stopPropagation()}
      onPointerUp={event => {
        event.stopPropagation();
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        onSelect();
      }}
      onContextMenu={event => event.stopPropagation()}
    >
      {content}
    </button>
  );
}

export default MonitoringWidget;
