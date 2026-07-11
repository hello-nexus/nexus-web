import { useEffect } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { useSensors } from '../../../hooks/useSensors';
import { useSensorExtras } from '../../../hooks/useSensorExtras';
import { useNetworkMonitor } from '../../../hooks/useNetworkMonitor';
import type { WidgetSettingsProps } from '../types';
import type { PanelConfigValue } from '../../types';
import { canEditFreeText } from '../../types';
import { Select } from '../../../components/common/Select/Select';
import { IconLabelButton } from '../../../components/common/IconLabelButton/IconLabelButton';
import { TextInput } from '../../../components/common/TextInput/TextInput';
import { GAUGE_DESIGN_KEYS, GAUGE_DESIGN_LABELS } from '../monitoring/gauges';
import { DESIGN_ICONS } from '../monitoring/gauges/DesignIcons';
import type { GaugeDesignKey } from '../monitoring/gauges';
import {
  DEFAULT_SLOTS,
  isMicroLayout,
  resolvedSlotCountForSize,
} from '../monitoring/perfSlots';
import type { DeviceKey } from '../monitoring/perfSlots';
import { buildNetworkSensors, NETWORK_SENSOR_TOTAL } from '../monitoring/networkSensors';
import { DEFAULT_SCALE_MODE, defaultFixedMax, designSupportsScale, type ScaleMode } from '../monitoring/perfDomain';
import { resolveSensor } from '../monitoring/MonitoringWidget';
import {
  CATEGORY_LABEL_KEYS, DEVICE_OPTION_KEYS, selectedSensorValue, sensorsForDevice, visibleDeviceKeys,
} from '../monitoring/sensorPicker';
import { SettingsSection } from '../common/SettingsRow/SettingsRow';
import styles from './MonitoringSettings.module.scss';

// A blank field commits the fallback (0 for min, the sensor's default ceiling
// for max) rather than parsing "" to 0 via Number().
function parseFixedRangeInput(raw: string, fallback: number): number {
  const trimmed = raw.trim();
  if (trimmed === '') return fallback;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const SCALE_OPTIONS: { value: ScaleMode; label: string }[] = [
  { value: 'adaptive', label: 'Adaptive' },
  { value: 'fixed',    label: 'Fixed' },
];

function defaultSensorForDevice(
  device: DeviceKey,
  sensors: ReturnType<typeof useSensors>,
  networkSensors: ReturnType<typeof buildNetworkSensors>,
  extras: ReturnType<typeof useSensorExtras>,
): string {
  const firstSensor = sensorsForDevice(sensors, networkSensors, extras, device)[0]?.value;
  if (firstSensor) return firstSensor;
  if (device === 'network') return NETWORK_SENSOR_TOTAL;
  return device === 'fps' ? 'FPS' : '';
}

// Eligibility is gated on the active slot count: a device qualifies when it
// exposes at least `count` distinct sensors. Network has exactly 3 sensors,
// so it qualifies at count=3 and is hidden at count=4. Bumping count above
// the device's sensor budget falls back to the first eligible device in
// DEVICE_OPTION_KEYS order (Quick, whose summary sensors usually clear every
// count, unless the box lacks a GPU and the service omits the GPU-derived ones).
function deviceHasEnoughSensorsForMicro(
  sensors: ReturnType<typeof useSensors>,
  networkSensors: ReturnType<typeof buildNetworkSensors>,
  extras: ReturnType<typeof useSensorExtras>,
  device: DeviceKey,
  count: number,
): boolean {
  return sensorsForDevice(sensors, networkSensors, extras, device).length >= count;
}

function firstEligibleMicroDevice(
  sensors: ReturnType<typeof useSensors>,
  networkSensors: ReturnType<typeof buildNetworkSensors>,
  extras: ReturnType<typeof useSensorExtras>,
  count: number,
): DeviceKey {
  for (const device of DEVICE_OPTION_KEYS) {
    if (deviceHasEnoughSensorsForMicro(sensors, networkSensors, extras, device, count)) return device;
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
  extras: ReturnType<typeof useSensorExtras>,
  count: number,
): Record<string, PanelConfigValue> {
  const currentDevice = ((widget.config?.micro_device as DeviceKey | undefined) ?? 'cpu');
  const targetDevice = deviceHasEnoughSensorsForMicro(sensors, networkSensors, extras, currentDevice, count)
    ? currentDevice
    : firstEligibleMicroDevice(sensors, networkSensors, extras, count);

  const sensorList = sensorsForDevice(sensors, networkSensors, extras, targetDevice);
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
  // Hiding empty categories (visibleDeviceKeys below) needs every
  // extras-backed category's real sensor count up front, not just the
  // active slot's - so the settings pane always subscribes while open. It
  // is transient, mounted only while a widget is being edited.
  const usesExtras = true;
  const network = useNetworkMonitor(usesNetwork);
  const networkSensors = buildNetworkSensors(network);
  const extras = useSensorExtras(usesExtras);

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
    const patch = microNormalizationPatch(widget, sensors, networkSensors, extras, count);
    if (Object.keys(patch).length > 0) onUpdate(patch);
  }, [isMicro, count, widget, sensors, networkSensors, extras, onUpdate]);

  // Rendered only in non-Micro mode, but computed unconditionally so the
  // hook count above never depends on the isMicro branch.
  const activeConfig = slotConfigs[activeSlot] ?? slotConfigs[0];
  const deviceOptions: { value: DeviceKey; label: string }[] = visibleDeviceKeys(DEVICE_OPTION_KEYS, activeConfig?.device ?? 'cpu', sensors, networkSensors, extras)
    .map(category => ({ value: category, label: t(CATEGORY_LABEL_KEYS[category]) }));
  const sensorOptions = activeConfig ? sensorsForDevice(sensors, networkSensors, extras, activeConfig.device) : [];
  const sensorValue = activeConfig ? selectedSensorValue(sensorOptions, activeConfig.sensorName) : '';
  const activeSensor = activeConfig ? resolveSensor(sensors, [], networkSensors, activeConfig.device, sensorValue, undefined, extras) : undefined;
  const fixedDefaultMax = activeConfig ? defaultFixedMax(activeConfig.device, activeSensor, activeConfig.sensorName) : 100;
  const fixedRangeMin = activeConfig?.fixedMin ?? 0;
  const fixedRangeMax = activeConfig?.fixedMax ?? fixedDefaultMax;
  // An inverted/degenerate typed range falls back to [0, fixedDefaultMax] at
  // render time (chartDomainForScale); flag both fields so that fallback
  // isn't silent.
  const fixedRangeInvalid = fixedRangeMin >= fixedRangeMax;
  const commitFixedMin = (raw: string) => {
    const parsed = parseFixedRangeInput(raw, 0);
    if (parsed !== fixedRangeMin) onUpdate({ [`slot${activeSlot}_min`]: parsed });
  };
  const commitFixedMax = (raw: string) => {
    const parsed = parseFixedRangeInput(raw, fixedDefaultMax);
    if (parsed !== fixedRangeMax) onUpdate({ [`slot${activeSlot}_max`]: parsed });
  };

  if (isMicro) {
    const microSensorOptions = sensorsForDevice(sensors, networkSensors, extras, microDevice);
    const microDeviceOptions = visibleDeviceKeys(DEVICE_OPTION_KEYS, microDevice, sensors, networkSensors, extras).map(category => ({
      value: category,
      label: t(CATEGORY_LABEL_KEYS[category]),
      disabled: !deviceHasEnoughSensorsForMicro(sensors, networkSensors, extras, category, count),
    }));

    return (
      <div className={styles.settingsRoot}>
        <SettingsSection title={t('monitoring.settings.device')}>
          <Select
            className={styles.selectWide}
            value={microDevice}
            onChange={v => {
              const next = v as DeviceKey;
              const list = sensorsForDevice(sensors, networkSensors, extras, next);
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
                  [`slot${activeSlot}_sensor`]: defaultSensorForDevice(v as DeviceKey, sensors, networkSensors, extras),
                  // A Fixed-range override is scoped to the sensor it was set
                  // on; a device swap invalidates it, so the newly-selected
                  // sensor falls back to its own default range.
                  [`slot${activeSlot}_min`]: null,
                  [`slot${activeSlot}_max`]: null,
                })}
                options={deviceOptions}
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
              {activeConfig.scale === 'fixed' && canEditFreeText(surface, desktopEditor) && (
                <div className={styles.rangeRow}>
                  <div className={styles.rangeField}>
                    <span className={styles.rangeFieldLabel}>{t('monitoring.settings.rangeMin')}</span>
                    <TextInput
                      type="number"
                      size="sm"
                      value={String(fixedRangeMin)}
                      ariaLabel={t('monitoring.settings.rangeMin')}
                      invalid={fixedRangeInvalid}
                      onBlur={commitFixedMin}
                    />
                  </div>
                  <div className={styles.rangeField}>
                    <span className={styles.rangeFieldLabel}>{t('monitoring.settings.rangeMax')}</span>
                    <TextInput
                      type="number"
                      size="sm"
                      value={String(fixedRangeMax)}
                      ariaLabel={t('monitoring.settings.rangeMax')}
                      invalid={fixedRangeInvalid}
                      onBlur={commitFixedMax}
                    />
                  </div>
                </div>
              )}
            </SettingsSection>
          )}
        </>
      )}
    </div>
  );
}
