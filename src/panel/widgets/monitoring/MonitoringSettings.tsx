import { useEffect } from 'react';
import { useSensors } from '../../../hooks/useSensors';
import { useNetworkMonitor } from '../../../hooks/useNetworkMonitor';
import type { WidgetSettingsProps } from '../types';
import type { PanelConfigValue } from '../../types';
import { Select } from '../../../components/common/Select/Select';
import { IconLabelButton } from '../../../components/common/IconLabelButton/IconLabelButton';
import { GAUGE_DESIGN_KEYS, GAUGE_DESIGN_LABELS } from '../monitoring/gauges';
import { DESIGN_ICONS } from '../monitoring/gauges/DesignIcons';
import type { GaugeDesignKey } from '../monitoring/gauges';
import {
  DEFAULT_SLOTS,
  isMicroLayout,
  resolvedSlotCountForSize,
} from '../monitoring/perfSlots';
import type { DeviceKey } from '../monitoring/perfSlots';
import { buildNetworkSensors, networkSensorOptions, NETWORK_SENSOR_TOTAL } from '../monitoring/networkSensors';
import { bareSensorLabel } from '../monitoring/sensorNames';
import { DEFAULT_SCALE_MODE, designSupportsScale, type ScaleMode } from '../monitoring/perfDomain';
import styles from './MonitoringSettings.module.scss';

const SCALE_OPTIONS: { value: ScaleMode; label: string }[] = [
  { value: 'adaptive', label: 'Adaptive' },
  { value: 'fixed',    label: 'Fixed' },
];

interface SensorOption {
  value: string;
  label: string;
}

const DEVICE_OPTIONS: { value: DeviceKey; label: string }[] = [
  { value: 'cpu',     label: 'CPU' },
  { value: 'gpu',     label: 'GPU' },
  { value: 'memory',  label: 'Memory' },
  { value: 'fan',     label: 'Fan' },
  { value: 'storage', label: 'Storage' },
  { value: 'network', label: 'Network' },
  { value: 'fps',     label: 'FPS' },
];

function sensorsForDevice(
  sensors: ReturnType<typeof useSensors>,
  networkSensors: ReturnType<typeof buildNetworkSensors>,
  device: DeviceKey,
): SensorOption[] {
  let options: SensorOption[];
  switch (device) {
    case 'cpu':
      options = sensors.cpu.map(s => ({ value: s.name, label: `${bareSensorLabel('cpu', s.name) || s.name} (${s.type})` }));
      break;
    case 'gpu':
      options = sensors.gpu.map(s => ({ value: s.name, label: `${bareSensorLabel('gpu', s.name) || s.name} (${s.type})` }));
      break;
    case 'memory':
      options = sensors.memory.map(s => ({ value: s.name, label: `${bareSensorLabel('memory', s.name) || s.name} (${s.type})` }));
      break;
    case 'fan':
      options = sensors.motherboard
        .filter(s => s.type === 'Fan')
        .map(s => ({ value: s.name, label: s.name }));
      break;
    case 'storage':
      options = sensors.storageSensors.map(s => ({ value: s.name, label: s.name }));
      break;
    case 'network':
      options = networkSensors.length > 0
        ? networkSensorOptions().map(o => ({ value: o.value, label: bareSensorLabel('network', o.label) || o.label }))
        : [];
      break;
    case 'fps':
      options = [
        { value: 'FPS', label: 'FPS' },
        { value: 'Frame Time', label: 'Frame Time' },
      ];
      break;
    default:
      options = [];
  }

  return uniqueOptions(options);
}

function defaultSensorForDevice(
  device: DeviceKey,
  sensors: ReturnType<typeof useSensors>,
  networkSensors: ReturnType<typeof buildNetworkSensors>,
): string {
  const firstSensor = sensorsForDevice(sensors, networkSensors, device)[0]?.value;
  if (firstSensor) return firstSensor;
  if (device === 'network') return NETWORK_SENSOR_TOTAL;
  return device === 'fps' ? 'FPS' : '';
}

function uniqueOptions(options: SensorOption[]): SensorOption[] {
  const seen = new Set<string>();
  return options.filter(option => {
    if (!option.value || seen.has(option.value)) return false;
    seen.add(option.value);
    return true;
  });
}

function selectedSensorValue(options: SensorOption[], sensorName: string): string {
  if (sensorName && options.some(opt => opt.value === sensorName)) return sensorName;
  return options[0]?.value ?? '';
}

// Eligibility is gated on the active slot count: a device qualifies when it
// exposes at least `count` distinct sensors. Network has exactly 3 sensors,
// so it qualifies at count=3 and is hidden at count=4. Bumping count above
// the device's sensor budget falls back to the first device that can fill
// the slots (typically CPU).
function deviceHasEnoughSensorsForMicro(
  sensors: ReturnType<typeof useSensors>,
  networkSensors: ReturnType<typeof buildNetworkSensors>,
  device: DeviceKey,
  count: number,
): boolean {
  return sensorsForDevice(sensors, networkSensors, device).length >= count;
}

function firstEligibleMicroDevice(
  sensors: ReturnType<typeof useSensors>,
  networkSensors: ReturnType<typeof buildNetworkSensors>,
  count: number,
): DeviceKey {
  for (const opt of DEVICE_OPTIONS) {
    if (deviceHasEnoughSensorsForMicro(sensors, networkSensors, opt.value, count)) return opt.value;
  }
  // Hardware not enumerated yet (early boot): fall back to CPU and let the
  // multi-sensor render path show empty rows until sensor topics catch up.
  return 'cpu';
}

// Build a patch to bring the Micro-only keyspace (`micro_device`,
// `micro_sensorN`) into a consistent shape for the active count. Sensor
// slots beyond `count` are deliberately left untouched so that flipping
// 3 -> 4 -> 3 preserves the user's pick for slot 4. Multi-sensor keys
// (`slot{N}_*`) are never read or written here.
function microNormalizationPatch(
  widget: { config?: Record<string, PanelConfigValue> },
  sensors: ReturnType<typeof useSensors>,
  networkSensors: ReturnType<typeof buildNetworkSensors>,
  count: number,
): Record<string, PanelConfigValue> {
  const currentDevice = ((widget.config?.micro_device as DeviceKey | undefined) ?? 'cpu');
  const targetDevice = deviceHasEnoughSensorsForMicro(sensors, networkSensors, currentDevice, count)
    ? currentDevice
    : firstEligibleMicroDevice(sensors, networkSensors, count);

  const sensorList = sensorsForDevice(sensors, networkSensors, targetDevice);
  const patch: Record<string, PanelConfigValue> = {};

  if ((widget.config?.micro_device as string | undefined) !== targetDevice) {
    patch.micro_device = targetDevice;
  }

  for (let i = 0; i < count; i++) {
    const stored = ((widget.config?.[`micro_sensor${i}`] as string | undefined) ?? '');
    const valid = stored && sensorList.some(opt => opt.value === stored);
    if (!valid) {
      patch[`micro_sensor${i}`] = sensorList[i]?.value ?? sensorList[0]?.value ?? '';
    }
  }

  return patch;
}

export function MonitoringSettings({ widget, onUpdate, selectedSlot = 0 }: WidgetSettingsProps) {
  const sensors = useSensors(true);
  const count = resolvedSlotCountForSize(widget.size, (widget.config?.slotCount as number | undefined));
  const activeSlot = Math.max(0, Math.min(selectedSlot, count - 1));
  const isMicro = isMicroLayout(widget.size, count);

  const slotConfigs = Array.from({ length: count }, (_, i) => {
    const device = ((widget.config?.[`slot${i}_device`] as DeviceKey | undefined) ?? DEFAULT_SLOTS[i]?.device ?? 'cpu');
    const sensorName = ((widget.config?.[`slot${i}_sensor`] as string | undefined) ?? DEFAULT_SLOTS[i]?.sensor ?? '');
    const effectiveSensorName = device === 'network' && !sensorName ? NETWORK_SENSOR_TOTAL
      : device === 'fps' && !sensorName ? 'FPS'
      : sensorName;
    const design = ((widget.config?.[`slot${i}_design`] as GaugeDesignKey | undefined) ?? DEFAULT_SLOTS[i]?.design ?? 'sparkline');
    const scale = ((widget.config?.[`slot${i}_scale`] as ScaleMode | undefined) ?? DEFAULT_SCALE_MODE);
    return { device, sensorName: effectiveSensorName, design, scale };
  });

  const microDevice = ((widget.config?.micro_device as DeviceKey | undefined) ?? 'cpu');
  const microSensorNames = Array.from({ length: count }, (_, i) => ((widget.config?.[`micro_sensor${i}`] as string | undefined) ?? ''));

  const usesNetwork = isMicro
    ? microDevice === 'network'
    : slotConfigs.some(slot => slot.device === 'network');
  const network = useNetworkMonitor(usesNetwork);
  const networkSensors = buildNetworkSensors(network);

  // When the user lands in Micro mode the dedicated `micro_*` keyspace might
  // be uninitialised (first time) or hold a sensor name that does not exist
  // for the current device (after a device switch). Normalize lazily so the
  // pane shows real picks. Multi-sensor `slot{N}_*` keys are never touched.
  useEffect(() => {
    if (!isMicro) return;
    const patch = microNormalizationPatch(widget, sensors, networkSensors, count);
    if (Object.keys(patch).length > 0) onUpdate(patch);
  }, [isMicro, count, widget, sensors, networkSensors, onUpdate]);

  if (isMicro) {
    const microSensorOptions = sensorsForDevice(sensors, networkSensors, microDevice);
    const microDeviceOptions = DEVICE_OPTIONS.map(opt => ({
      ...opt,
      disabled: !deviceHasEnoughSensorsForMicro(sensors, networkSensors, opt.value, count),
    }));

    return (
      <div className={styles.settingsRoot}>
        <div className={styles.editorBlock}>
          <div className={styles.subLabel}>Device</div>
          <Select
            className={styles.selectWide}
            size="sm"
            value={microDevice}
            onChange={v => {
              const next = v as DeviceKey;
              const list = sensorsForDevice(sensors, networkSensors, next);
              const patch: Record<string, PanelConfigValue> = { micro_device: next };
              for (let i = 0; i < count; i++) {
                patch[`micro_sensor${i}`] = list[i]?.value ?? list[0]?.value ?? '';
              }
              onUpdate(patch);
            }}
            options={microDeviceOptions}
            ariaLabel="Device"
          />

          <div className={styles.subLabel}>Sensors</div>
          <div className={styles.microSensorList}>
            {microSensorNames.map((name, i) => (
              <Select
                key={i}
                className={styles.selectWide}
                size="sm"
                value={selectedSensorValue(microSensorOptions, name)}
                onChange={v => onUpdate({ [`micro_sensor${i}`]: v })}
                options={microSensorOptions}
                ariaLabel={`Sensor ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const activeConfig = slotConfigs[activeSlot] ?? slotConfigs[0];
  const sensorOptions = activeConfig ? sensorsForDevice(sensors, networkSensors, activeConfig.device) : [];
  const sensorValue = activeConfig ? selectedSensorValue(sensorOptions, activeConfig.sensorName) : '';

  return (
    <div className={styles.settingsRoot}>
      {activeConfig && (
        <div className={styles.editorBlock}>
          <div className={styles.subLabel}>Sensor</div>
          <div className={styles.sensorRow}>
            <Select
              className={styles.selectSmall}
              size="sm"
              value={activeConfig.device}
              onChange={v => onUpdate({
                [`slot${activeSlot}_device`]: v,
                [`slot${activeSlot}_sensor`]: defaultSensorForDevice(v as DeviceKey, sensors, networkSensors),
              })}
              options={DEVICE_OPTIONS}
              ariaLabel="Device"
            />
            <Select
              className={styles.selectWide}
              size="sm"
              value={sensorValue}
              onChange={v => onUpdate({ [`slot${activeSlot}_sensor`]: v })}
              options={sensorOptions}
              ariaLabel="Sensor"
            />
          </div>

          <div className={styles.subLabel}>Design</div>
          <div className={styles.designRow}>
            {GAUGE_DESIGN_KEYS.map(k => {
              const Icon = DESIGN_ICONS[k];
              const active = k === activeConfig.design;
              return (
                <IconLabelButton
                  key={k}
                  className={styles.designBtn}
                  active={active}
                  icon={Icon ? <Icon aria-hidden="true" /> : undefined}
                  label={GAUGE_DESIGN_LABELS[k]}
                  onPress={() => onUpdate({ [`slot${activeSlot}_design`]: k })}
                />
              );
            })}
          </div>

          {designSupportsScale(activeConfig.design) && (
            <>
              <div className={styles.subLabel}>Range</div>
              <div className={styles.scaleRow}>
                {SCALE_OPTIONS.map(opt => (
                  <IconLabelButton
                    key={opt.value}
                    className={styles.scaleBtn}
                    active={opt.value === activeConfig.scale}
                    label={opt.label}
                    onPress={() => onUpdate({ [`slot${activeSlot}_scale`]: opt.value })}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
