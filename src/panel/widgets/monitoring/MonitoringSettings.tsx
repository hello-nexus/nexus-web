import { useEffect, useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { useSensors } from '../../../hooks/useSensors';
import { useNetworkMonitor } from '../../../hooks/useNetworkMonitor';
import type { WidgetSettingsProps } from '../types';
import type { PanelConfigValue } from '../../types';
import { canEditFreeText } from '../../types';
import { Select } from '../../../components/common/Select/Select';
import { IconLabelButton } from '../../../components/common/IconLabelButton/IconLabelButton';
import { RangeSlider } from '../../../components/common/Slider/RangeSlider';
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
import { SENSOR_CATEGORIES, sensorsForCategory } from '../monitoring/sensorCategories';
import type { SensorCategory } from '../monitoring/sensorCategories';
import { chartDomainForScale, DEFAULT_SCALE_MODE, defaultFixedMax, designSupportsScale, niceStep, type ScaleMode } from '../monitoring/perfDomain';
import { resolveSensor } from '../monitoring/MonitoringWidget';
import { SettingsSection } from '../common/SettingsRow/SettingsRow';
import styles from './MonitoringSettings.module.scss';

const SCALE_OPTIONS: { value: ScaleMode; label: string }[] = [
  { value: 'adaptive', label: 'Adaptive' },
  { value: 'fixed',    label: 'Fixed' },
];

interface SensorOption {
  value: string;
  label: string;
  sensorName?: string;
}

const CATEGORY_LABELS: Record<SensorCategory, string> = {
  quick: 'Quick',
  cpu: 'CPU',
  gpu: 'GPU',
  memory: 'Memory',
  motherboard: 'Motherboard',
  storage: 'Storage',
  network: 'Network',
  fps: 'FPS',
};

const DEVICE_OPTIONS: { value: DeviceKey; label: string }[] = SENSOR_CATEGORIES.map(category => ({
  value: category,
  label: CATEGORY_LABELS[category],
}));

function sensorsForDevice(
  sensors: ReturnType<typeof useSensors>,
  networkSensors: ReturnType<typeof buildNetworkSensors>,
  device: DeviceKey,
): SensorOption[] {
  let options: SensorOption[];
  switch (device) {
    case 'quick':
      options = sensorsForCategory('quick', sensors, networkSensors, []).map(s => ({ value: s.id, label: s.name, sensorName: s.name }));
      break;
    case 'cpu':
    case 'gpu':
    case 'memory':
    case 'motherboard':
      options = sensorsForCategory(device, sensors, networkSensors, []).map(s => ({
        value: s.id,
        label: `${bareSensorLabel(device, s.name) || s.name} (${s.type})`,
        sensorName: s.name,
      }));
      break;
    case 'fan':
      options = sensors.motherboard
        .filter(s => s.type === 'Fan')
        .map(s => ({ value: s.id, label: s.name, sensorName: s.name }));
      break;
    case 'storage':
      options = sensorsForCategory('storage', sensors, networkSensors, []).map(s => ({ value: s.id, label: s.name, sensorName: s.name }));
      break;
    case 'network':
      options = sensorsForCategory('network', sensors, networkSensors, []).length > 0
        ? networkSensorOptions().map(o => ({ value: o.value, label: bareSensorLabel('network', o.label) || o.label }))
        : [];
      break;
    case 'fps':
      options = sensorsForCategory('fps', sensors, networkSensors, []).map(s => ({ value: s.name, label: s.name }));
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

function selectedSensorValue(options: SensorOption[], storedKey: string): string {
  if (storedKey && options.some(opt => opt.value === storedKey)) return storedKey;
  const byName = storedKey ? options.find(opt => opt.sensorName === storedKey) : undefined;
  if (byName) return byName.value;
  return options[0]?.value ?? '';
}

// Eligibility is gated on the active slot count: a device qualifies when it
// exposes at least `count` distinct sensors. Network has exactly 3 sensors,
// so it qualifies at count=3 and is hidden at count=4. Bumping count above
// the device's sensor budget falls back to the first eligible device in
// DEVICE_OPTIONS order (Quick, whose summary sensors usually clear every count,
// unless the box lacks a GPU and the service omits the GPU-derived ones).
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
    const byId = stored ? sensorList.some(opt => opt.value === stored) : false;
    const byLegacyName = !byId && stored ? sensorList.find(opt => opt.sensorName === stored) : undefined;
    if (!byId && !byLegacyName) {
      patch[`micro_sensor${i}`] = sensorList[i]?.value ?? sensorList[0]?.value ?? '';
    } else if (byLegacyName) {
      patch[`micro_sensor${i}`] = byLegacyName.value;
    }
  }

  return patch;
}

export function MonitoringSettings({ widget, surface, desktopEditor, onUpdate, selectedSlot = 0 }: WidgetSettingsProps) {
  const { t } = useTranslation();
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
    const fixedMin = widget.config?.[`slot${i}_min`] as number | undefined;
    const fixedMax = widget.config?.[`slot${i}_max`] as number | undefined;
    return { device, sensorName: effectiveSensorName, design, scale, fixedMin, fixedMax };
  });

  const microDevice = ((widget.config?.micro_device as DeviceKey | undefined) ?? 'cpu');
  const microSensorNames = Array.from({ length: count }, (_, i) => ((widget.config?.[`micro_sensor${i}`] as string | undefined) ?? ''));

  const usesNetwork = isMicro
    ? microDevice === 'network'
    : slotConfigs.some(slot => slot.device === 'network');
  const network = useNetworkMonitor(usesNetwork);
  const networkSensors = buildNetworkSensors(network);

  // The Fan category folded into Motherboard. Migrate any slot (or micro) device
  // still stored as the legacy 'fan' so the picker shows Motherboard instead of a
  // blank row and the gauge uses the type-aware motherboard scaling. Fan sensors
  // resolve unchanged under motherboard, so each gauge renders identically.
  useEffect(() => {
    const patch: Record<string, PanelConfigValue> = {};
    for (let i = 0; i < count; i++) {
      if ((widget.config?.[`slot${i}_device`] as string | undefined) === 'fan') {
        patch[`slot${i}_device`] = 'motherboard';
      }
    }
    if ((widget.config?.micro_device as string | undefined) === 'fan') {
      patch.micro_device = 'motherboard';
    }
    if (Object.keys(patch).length > 0) onUpdate(patch);
  }, [count, widget, onUpdate]);

  // In Micro mode the `micro_*` keyspace may be uninitialised (first time) or
  // hold a sensor name absent for the current device (after a device switch).
  // Normalize lazily so the pane shows real picks. `slot{N}_*` keys untouched.
  useEffect(() => {
    if (!isMicro) return;
    const patch = microNormalizationPatch(widget, sensors, networkSensors, count);
    if (Object.keys(patch).length > 0) onUpdate(patch);
  }, [isMicro, count, widget, sensors, networkSensors, onUpdate]);

  // Rendered only in non-Micro mode, but computed unconditionally (with the
  // hooks below) so the hook count never depends on the isMicro branch.
  const activeConfig = slotConfigs[activeSlot] ?? slotConfigs[0];
  const sensorOptions = activeConfig ? sensorsForDevice(sensors, networkSensors, activeConfig.device) : [];
  const sensorValue = activeConfig ? selectedSensorValue(sensorOptions, activeConfig.sensorName) : '';
  const activeSensor = activeConfig ? resolveSensor(sensors, [], networkSensors, activeConfig.device, sensorValue) : undefined;
  const fixedDefaultMax = activeConfig ? defaultFixedMax(activeConfig.device, activeSensor, activeConfig.sensorName) : 100;
  const fixedRangeStep = niceStep(fixedDefaultMax);
  // Route the stored override through the same clamp the live gauge applies
  // (chartDomainForScale), so a stale min/max surviving a device/sensor swap
  // degrades identically here and on the tile - never an inverted or
  // off-track handle - instead of duplicating the clamp logic.
  const [storedRangeMin, storedRangeMax] = activeConfig
    ? chartDomainForScale(activeConfig.device, 0, [], fixedDefaultMax, 'fixed', undefined, undefined, activeConfig.fixedMin, activeConfig.fixedMax, fixedDefaultMax)
    : [0, 100];

  // Live drag preview, independent of the persisted config: PerfSlot/Settings
  // re-render on every live sensor tick, so feeding the RangeSlider straight
  // from widget.config would snap the thumb back mid-drag on the next tick.
  const [liveFixedRange, setLiveFixedRange] = useState<[number, number] | null>(null);
  useEffect(() => {
    setLiveFixedRange(null);
  }, [activeSlot, activeConfig?.device, activeConfig?.sensorName]);
  const fixedRangeValue: [number, number] = liveFixedRange ?? [storedRangeMin, storedRangeMax];
  const commitFixedRange = (v: [number, number]) => {
    setLiveFixedRange(null);
    onUpdate({ [`slot${activeSlot}_min`]: v[0], [`slot${activeSlot}_max`]: v[1] });
  };

  if (isMicro) {
    const microSensorOptions = sensorsForDevice(sensors, networkSensors, microDevice);
    const microDeviceOptions = DEVICE_OPTIONS.map(opt => ({
      ...opt,
      disabled: !deviceHasEnoughSensorsForMicro(sensors, networkSensors, opt.value, count),
    }));

    return (
      <div className={styles.settingsRoot}>
        <SettingsSection title={t('monitoring.settings.device')}>
          <Select
            className={styles.selectWide}
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
            ariaLabel={t('monitoring.settings.device')}
          />
        </SettingsSection>

        <SettingsSection title={t('monitoring.settings.sensors')}>
          <div className={styles.microSensorList}>
            {microSensorNames.map((name, i) => (
              <Select
                key={i}
                className={styles.selectWide}
                value={selectedSensorValue(microSensorOptions, name)}
                onChange={v => onUpdate({ [`micro_sensor${i}`]: v })}
                options={microSensorOptions}
                ariaLabel={`Sensor ${i + 1}`}
              />
            ))}
          </div>
        </SettingsSection>
      </div>
    );
  }

  return (
    <div className={styles.settingsRoot}>
      {activeConfig && (
        <>
          <SettingsSection title={t('monitoring.settings.sensor')}>
            <div className={styles.sensorRow}>
              <Select
                className={styles.selectSmall}
                value={activeConfig.device}
                onChange={v => onUpdate({
                  [`slot${activeSlot}_device`]: v,
                  [`slot${activeSlot}_sensor`]: defaultSensorForDevice(v as DeviceKey, sensors, networkSensors),
                  // A Fixed-range override is scoped to the sensor it was set
                  // on; a device swap invalidates it, so the newly-selected
                  // sensor falls back to its own default range.
                  [`slot${activeSlot}_min`]: null,
                  [`slot${activeSlot}_max`]: null,
                })}
                options={DEVICE_OPTIONS}
                ariaLabel={t('monitoring.settings.device')}
              />
              <Select
                className={styles.selectWide}
                value={sensorValue}
                onChange={v => onUpdate({
                  [`slot${activeSlot}_sensor`]: v,
                  [`slot${activeSlot}_min`]: null,
                  [`slot${activeSlot}_max`]: null,
                })}
                options={sensorOptions}
                ariaLabel={t('monitoring.settings.sensor')}
              />
            </div>
          </SettingsSection>

          <SettingsSection title={t('monitoring.settings.design')}>
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
                    title={GAUGE_DESIGN_LABELS[k]}
                    ariaLabel={GAUGE_DESIGN_LABELS[k]}
                    onPress={() => onUpdate({ [`slot${activeSlot}_design`]: k })}
                  />
                );
              })}
            </div>
          </SettingsSection>

          {designSupportsScale(activeConfig.design) && (
            <SettingsSection title={t('monitoring.settings.range')}>
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
              {activeConfig.scale === 'fixed' && (
                <RangeSlider
                  className={styles.fixedRangeSlider}
                  // eslint-disable-next-line i18next/no-literal-string -- slider layout enum
                  orientation="stacked"
                  editable={canEditFreeText(surface, desktopEditor)}
                  value={fixedRangeValue}
                  min={0}
                  max={fixedDefaultMax}
                  step={fixedRangeStep}
                  minGap={fixedRangeStep}
                  onChange={(v, commit) => (commit ? commitFixedRange(v) : setLiveFixedRange(v))}
                  onCommit={commitFixedRange}
                  ariaLabelMin={t('monitoring.settings.rangeMin')}
                  ariaLabelMax={t('monitoring.settings.rangeMax')}
                />
              )}
            </SettingsSection>
          )}
        </>
      )}
    </div>
  );
}
