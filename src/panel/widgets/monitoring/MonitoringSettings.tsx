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
import { GAUGE_DESIGN_LABELS } from '../monitoring/gauges';
import { DESIGN_ICONS } from '../monitoring/gauges/DesignIcons';
import type { GaugeDesignKey } from '../monitoring/gauges';
import {
  DEFAULT_MICRO_DESIGN,
  DEFAULT_SLOTS,
  defaultSlotDesign,
  designKeysForSlot,
  isMicroLayout,
  isMicroMultiDevice,
  MICRO_DESIGN_KEYS,
  microRowDevice,
  resolvedSlotLayout,
  resolveSlotDesign,
} from '../monitoring/perfSlots';
import type { DeviceKey } from '../monitoring/perfSlots';
import { buildNetworkSensors, NETWORK_SENSOR_TOTAL } from '../monitoring/networkSensors';
import { bareSensorLabel } from '../monitoring/sensorNames';
import { DEFAULT_SCALE_MODE, defaultFixedMax, designSupportsRange, staticMaxForDevice, type ScaleMode } from '../monitoring/perfDomain';
import { designSupportsValueColor, sensorSupportsValueColor } from '../monitoring/valueColor';
import { usePanelGaugeGradient } from '../common/PanelGaugeGradientContext';
import { GradientStopsEditor } from '../../../components/common/GradientStopsEditor/GradientStopsEditor';
import {
  DEFAULT_GAUGE_GRADIENT, gaugeGradientEquals, MAX_GAUGE_GRADIENT_STOPS, MIN_GAUGE_GRADIENT_STOPS,
} from '../../theme/gaugeGradient';
import { RotateCcw } from 'lucide-react';
import { labelForDevice, resolveSensor } from '../monitoring/MonitoringWidget';
import { bottomLabelForDevice } from '../monitoring/MicroMonitoringWidget';
import {
  CATEGORY_LABEL_KEYS, DEVICE_OPTION_KEYS, selectedSensorValue, sensorsForDevice, visibleDeviceKeys,
} from '../monitoring/sensorPicker';
import { SettingsSection, SettingsRow, SettingsToggle, SettingsButton } from '../common/SettingsRow/SettingsRow';
import { ChipGroup } from '../../../components/common/ChipGroup/ChipGroup';
import { DesktopOnlyBadge } from '../../../components/common/DesktopOnlyBadge/DesktopOnlyBadge';
import styles from './MonitoringSettings.module.scss';

// The panel-wide gauge gradient, edited from whichever monitoring widget has
// value colouring on. One list per panel, so this edits the same stops every
// other monitoring widget on the panel paints with.
function GaugeGradientSection() {
  const { t } = useTranslation();
  const { source, accent, preview, commit } = usePanelGaugeGradient();
  const isDefault = gaugeGradientEquals(source, DEFAULT_GAUGE_GRADIENT);
  return (
    <div className={styles.gradientBlock}>
      <GradientStopsEditor
        stops={source}
        accent={accent}
        onPreview={preview}
        onCommit={commit}
        minStops={MIN_GAUGE_GRADIENT_STOPS}
        maxStops={MAX_GAUGE_GRADIENT_STOPS}
      />
      <div className={styles.gradientFooter}>
        <SettingsButton variant="muted" disabled={isDefault} onClick={() => commit([...DEFAULT_GAUGE_GRADIENT])}>
          {t('monitoring.settings.gradientReset')}
        </SettingsButton>
      </div>
    </div>
  );
}

// A blank field commits the fallback (0 for min, the sensor's default ceiling
// for max) rather than parsing "" to 0 via Number().
export function parseFixedRangeInput(raw: string, fallback: number): number {
  const trimmed = raw.trim();
  if (trimmed === '') return fallback;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const SCALE_OPTIONS: { value: ScaleMode; labelKey: string }[] = [
  { value: 'adaptive', labelKey: 'monitoring.settings.scaleAdaptive' },
  { value: 'fixed',    labelKey: 'monitoring.settings.scaleFixed' },
];

// Auto / Hide / Custom caption modes. Keys are stored in `*_labelMode`
// (absent = auto); labels route through i18n at render.
const LABEL_MODE_OPTIONS: { key: string; labelKey: string }[] = [
  { key: 'auto',   labelKey: 'monitoring.settings.labelAuto' },
  { key: 'hide',   labelKey: 'monitoring.settings.labelHide' },
  { key: 'custom', labelKey: 'monitoring.settings.labelCustom' },
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
  if (isMicroMultiDevice(widget.config)) {
    return microMultiDeviceNormalizationPatch(widget, sensors, networkSensors, extras, count);
  }
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

// Multi-device rows need no device-wide sensor budget: each row only has to
// hold a sensor of its own device. A device with no sensors listed yet (early
// boot, fps without a stream) keeps its stored pick.
function microMultiDeviceNormalizationPatch(
  widget: { config?: Record<string, PanelConfigValue> },
  sensors: ReturnType<typeof useSensors>,
  networkSensors: ReturnType<typeof buildNetworkSensors>,
  extras: ReturnType<typeof useSensorExtras>,
  count: number,
): Record<string, PanelConfigValue> {
  const patch: Record<string, PanelConfigValue> = {};
  for (let i = 0; i < count; i++) {
    const sensorList = sensorsForDevice(sensors, networkSensors, extras, microRowDevice(widget.config, i));
    if (sensorList.length === 0) continue;
    const stored = ((widget.config?.[`micro_sensor${i}`] as string | undefined) ?? '');
    if (stored && sensorList.some(opt => opt.value === stored)) continue;
    const byLegacyName = stored ? sensorList.find(opt => opt.sensorName === stored) : undefined;
    patch[`micro_sensor${i}`] = byLegacyName?.value ?? sensorList[0].value;
  }
  return patch;
}

// Derived label a micro sensor row would show, used as the override field's
// placeholder. Mirrors MicroRow: strip the device prefix, fall back to the raw
// sensor name. fps sensors don't resolve here (settings has no fps stream), so
// they fall through to the stored name.
function microAutoLabel(
  device: DeviceKey,
  rawName: string,
  sensors: ReturnType<typeof useSensors>,
  networkSensors: ReturnType<typeof buildNetworkSensors>,
  extras: ReturnType<typeof useSensorExtras>,
  prefixed: boolean,
): string {
  const effectiveName = device === 'network' && !rawName ? NETWORK_SENSOR_TOTAL : rawName;
  const sensor = resolveSensor(sensors, [], networkSensors, device, effectiveName, undefined, extras);
  const name = sensor?.name ?? '';
  if (prefixed) return labelForDevice(device, name || effectiveName);
  return bareSensorLabel(device, name) || name || effectiveName;
}

// Config writes for one caption's Auto/Hide/Custom chip + live text field.
// The custom text (labelKey) is retained across mode switches - switching to
// Auto/Hide only flips modeKey, so returning to Custom restores what was typed;
// entering Custom the first time seeds it with the derived name so the field
// shows real text, not a grey placeholder. Reset refills the field with the
// current derived name (it does not leave Custom mode).
function labelControlHandlers(
  onUpdate: (patch: Record<string, PanelConfigValue>) => void,
  modeKey: string,
  labelKey: string,
  override: string,
  autoLabel: string,
) {
  return {
    onSelectMode: (next: string) => {
      if (next === 'custom') {
        onUpdate(override.trim() ? { [modeKey]: 'custom' } : { [modeKey]: 'custom', [labelKey]: autoLabel });
      } else if (next === 'hide') {
        onUpdate({ [modeKey]: 'hide' });
      } else {
        onUpdate({ [modeKey]: null });
      }
    },
    onChangeText: (value: string) => onUpdate({ [labelKey]: value }),
    onReset: () => onUpdate({ [labelKey]: autoLabel }),
  };
}

// A caption's Label control: a "Label" row with the Auto / Hide / Custom chips
// aligned right, and (in Custom) a live text field with a reset-to-sensor-name
// glyph. Rendered inline as the second line of the Sensor/Device block. Shared
// by the per-slot, micro per-sensor, and micro category editors, and (exported)
// by the deck Monitoring action editor. The free-text field is desktop-only
// (canType); a kiosk sheet shows a badge instead.
export function LabelControls({
  mode,
  override,
  autoLabel,
  canType,
  onSelectMode,
  onChangeText,
  onReset,
}: {
  mode: string;
  override: string;
  autoLabel: string;
  canType: boolean;
  onSelectMode: (mode: string) => void;
  onChangeText: (value: string) => void;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  return (
    // data-settings-aside opts the block out of the SettingsSection hairline
    // divider so the Label row has no separator above (the selects) or below.
    <div className={styles.labelBlock} data-settings-aside="true">
      <SettingsRow label={t('monitoring.settings.label')}>
        <ChipGroup
          ariaLabel={t('monitoring.settings.label')}
          activeKey={mode}
          onChange={onSelectMode}
          options={LABEL_MODE_OPTIONS.map(o => ({ key: o.key, label: t(o.labelKey) }))}
        />
      </SettingsRow>
      {mode === 'custom' && (canType ? (
        <div className={styles.labelFieldRow}>
          <div className={styles.labelField}>
            <TextInput
              size="sm"
              value={override}
              placeholder={autoLabel}
              maxLength={40}
              ariaLabel={t('monitoring.settings.customLabel')}
              onInput={onChangeText}
            />
          </div>
          <IconLabelButton
            className={styles.labelResetBtn}
            icon={<RotateCcw size={14} aria-hidden="true" />}
            ariaLabel={t('monitoring.settings.resetLabel')}
            onPress={onReset}
          />
        </div>
      ) : (
        <DesktopOnlyBadge />
      ))}
    </div>
  );
}

export function MonitoringSettings({ widget, surface, desktopEditor, onUpdate, selectedSlot = 0, onSelectedSlotChange }: WidgetSettingsProps) {
  const { t } = useTranslation();
  const sensors = useSensors(true);
  const layout = resolvedSlotLayout(widget.size, widget.config);
  const count = layout.count;
  const activeSlot = Math.max(0, Math.min(selectedSlot, count - 1));
  const isMicro = isMicroLayout(widget.size, count, layout.hero);

  const slotConfigs = Array.from({ length: count }, (_, i) => {
    const device = ((widget.config?.[`slot${i}_device`] as DeviceKey | undefined) ?? DEFAULT_SLOTS[i]?.device ?? 'cpu');
    const sensorName = ((widget.config?.[`slot${i}_sensor`] as string | undefined) ?? DEFAULT_SLOTS[i]?.sensor ?? '');
    const effectiveSensorName = device === 'network' && !sensorName ? NETWORK_SENSOR_TOTAL
      : device === 'fps' && !sensorName ? 'FPS'
      : sensorName;
    const design = resolveSlotDesign(
      widget.size,
      layout,
      i,
      ((widget.config?.[`slot${i}_design`] as GaugeDesignKey | undefined) ?? defaultSlotDesign(widget.size, i)),
    );
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
    const multiDevice = isMicroMultiDevice(widget.config);
    const rowDevices = microSensorNames.map((_, i) => microRowDevice(widget.config, i));
    const microSensorOptions = sensorsForDevice(sensors, networkSensors, extras, microDevice);
    const microDeviceOptions = visibleDeviceKeys(DEVICE_OPTION_KEYS, microDevice, sensors, networkSensors, extras).map(category => ({
      value: category,
      label: t(CATEGORY_LABEL_KEYS[category]),
      disabled: !deviceHasEnoughSensorsForMicro(sensors, networkSensors, extras, category, count),
    }));
    const microCanType = canEditFreeText(surface, desktopEditor);
    // Row style shared by every bar (Bars / Fill / Graph).
    const microDesign = (widget.config?.micro_design as GaugeDesignKey | undefined) ?? DEFAULT_MICRO_DESIGN;
    // Micro has one shared range for every bar (no per-slot scale). The default
    // Fixed ceiling is the device's static max; the user types free overrides.
    const microScale = (widget.config?.micro_scale as ScaleMode | undefined) ?? DEFAULT_SCALE_MODE;
    const microFixedDefaultMax = staticMaxForDevice(microDevice);
    const microFixedMin = (widget.config?.micro_min as number | undefined) ?? 0;
    const microFixedMax = (widget.config?.micro_max as number | undefined) ?? microFixedDefaultMax;
    const microFixedRangeInvalid = microFixedMin >= microFixedMax;
    const commitMicroMin = (raw: string) => {
      const parsed = parseFixedRangeInput(raw, 0);
      if (parsed !== microFixedMin) onUpdate({ micro_min: parsed });
    };
    const commitMicroMax = (raw: string) => {
      const parsed = parseFixedRangeInput(raw, microFixedDefaultMax);
      if (parsed !== microFixedMax) onUpdate({ micro_max: parsed });
    };
    // One toggle for every bar, so it shows when any of them is a percent or
    // temperature sensor; the rest keep the plain accent.
    const microValueColor = (widget.config?.micro_valueColor as boolean | undefined) ?? false;
    const microSupportsValueColor = microSensorNames.some((name, i) => sensorSupportsValueColor(
      resolveSensor(sensors, [], networkSensors, rowDevices[i], name, undefined, extras)?.type,
    ));

    return (
      <div className={styles.settingsRoot}>
        <SettingsSection title={t('monitoring.settings.design')}>
          <div className={styles.microDesignRow}>
            {MICRO_DESIGN_KEYS.map(k => {
              const Icon = DESIGN_ICONS[k];
              return (
                <IconLabelButton
                  key={k}
                  className={styles.microDesignBtn}
                  active={k === microDesign}
                  icon={Icon ? <Icon aria-hidden="true" /> : undefined}
                  title={GAUGE_DESIGN_LABELS[k]}
                  ariaLabel={GAUGE_DESIGN_LABELS[k]}
                  onPress={() => onUpdate({ micro_design: k })}
                />
              );
            })}
          </div>
        </SettingsSection>

        <SettingsSection title={t('monitoring.settings.device')}>
          <SettingsToggle
            label={t('monitoring.settings.multiDevice')}
            description={t('monitoring.settings.multiDeviceHint')}
            checked={multiDevice}
            onChange={next => {
              const patch: Record<string, PanelConfigValue> = { micro_multiDevice: next };
              // Rows start on the shared device, so their current picks carry over.
              if (next) for (let i = 0; i < count; i++) patch[`micro_device${i}`] = microDevice;
              onUpdate(patch);
            }}
          />
          {!multiDevice && <Select
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
          />}
          {!multiDevice && (() => {
            const catOverride = (widget.config?.micro_category as string | undefined) ?? '';
            const catAuto = bottomLabelForDevice(microDevice, sensors, t);
            return (
              <LabelControls
                mode={(widget.config?.micro_categoryMode as string | undefined) ?? 'auto'}
                override={catOverride}
                autoLabel={catAuto}
                canType={microCanType}
                {...labelControlHandlers(onUpdate, 'micro_categoryMode', 'micro_category', catOverride, catAuto)}
              />
            );
          })()}
        </SettingsSection>

        <SettingsSection title={t('monitoring.settings.sensors')}>
          <div className={styles.microSensorList}>
            {microSensorNames.map((name, i) => {
              const rowDevice = rowDevices[i];
              const rowSensorOptions = multiDevice
                ? sensorsForDevice(sensors, networkSensors, extras, rowDevice)
                : microSensorOptions;
              const sOverride = (widget.config?.[`micro_sensor${i}_label`] as string | undefined) ?? '';
              const sAuto = microAutoLabel(rowDevice, name, sensors, networkSensors, extras, multiDevice);
              const sensorSelect = (
                <Select
                  className={styles.selectWide}
                  value={selectedSensorValue(rowSensorOptions, name)}
                  onChange={v => onUpdate({ [`micro_sensor${i}`]: v })}
                  options={rowSensorOptions}
                  ariaLabel={`Sensor ${i + 1}`}
                />
              );
              return (
                <div
                  key={i}
                  className={styles.microSensorRow}
                  // Selects the sensor so the live tile marks the bar being edited.
                  onFocusCapture={() => onSelectedSlotChange?.(i)}
                  onPointerDownCapture={() => onSelectedSlotChange?.(i)}
                >
                  {multiDevice ? (
                    <div className={styles.sensorRow}>
                      <Select
                        className={styles.selectSmall}
                        value={rowDevice}
                        onChange={v => onUpdate({
                          [`micro_device${i}`]: v,
                          [`micro_sensor${i}`]: defaultSensorForDevice(v as DeviceKey, sensors, networkSensors, extras),
                        })}
                        options={visibleDeviceKeys(DEVICE_OPTION_KEYS, rowDevice, sensors, networkSensors, extras)
                          .map(category => ({ value: category, label: t(CATEGORY_LABEL_KEYS[category]) }))}
                        ariaLabel={`${t('monitoring.settings.device')} ${i + 1}`}
                      />
                      {sensorSelect}
                    </div>
                  ) : sensorSelect}
                  <LabelControls
                    mode={(widget.config?.[`micro_sensor${i}_labelMode`] as string | undefined) ?? 'auto'}
                    override={sOverride}
                    autoLabel={sAuto}
                    canType={microCanType}
                    {...labelControlHandlers(onUpdate, `micro_sensor${i}_labelMode`, `micro_sensor${i}_label`, sOverride, sAuto)}
                  />
                </div>
              );
            })}
          </div>
        </SettingsSection>

        {!multiDevice && (
          <SettingsSection title={t('monitoring.settings.range')}>
            <ChipGroup
              fullWidth
              ariaLabel={t('monitoring.settings.range')}
              activeKey={microScale}
              onChange={v => onUpdate({ micro_scale: v })}
              options={SCALE_OPTIONS.map(o => ({ key: o.value, label: t(o.labelKey) }))}
            />
            {microScale === 'fixed' && microCanType && (
              <div className={styles.rangeRow}>
                <div className={styles.rangeField}>
                  <span className={styles.rangeFieldLabel}>{t('monitoring.settings.rangeMin')}</span>
                  <TextInput
                    type="number"
                    size="sm"
                    value={String(microFixedMin)}
                    ariaLabel={t('monitoring.settings.rangeMin')}
                    invalid={microFixedRangeInvalid}
                    onBlur={commitMicroMin}
                  />
                </div>
                <div className={styles.rangeField}>
                  <span className={styles.rangeFieldLabel}>{t('monitoring.settings.rangeMax')}</span>
                  <TextInput
                    type="number"
                    size="sm"
                    value={String(microFixedMax)}
                    ariaLabel={t('monitoring.settings.rangeMax')}
                    invalid={microFixedRangeInvalid}
                    onBlur={commitMicroMax}
                  />
                </div>
              </div>
            )}
          </SettingsSection>
        )}

        {microSupportsValueColor && (
          <SettingsSection title={t('monitoring.settings.colors')}>
            <SettingsToggle
              label={t('monitoring.settings.valueColor')}
              description={t('monitoring.settings.valueColorHint')}
              checked={microValueColor}
              onChange={next => onUpdate({ micro_valueColor: next })}
            />
            {microValueColor && <GaugeGradientSection />}
          </SettingsSection>
        )}
      </div>
    );
  }

  const slotValueColor = (widget.config?.[`slot${activeSlot}_valueColor`] as boolean | undefined) ?? false;
  const slotLabelMode = (widget.config?.[`slot${activeSlot}_labelMode`] as string | undefined) ?? 'auto';
  const slotLabelOverride = (widget.config?.[`slot${activeSlot}_label`] as string | undefined) ?? '';
  const slotAutoLabel = activeConfig ? labelForDevice(activeConfig.device, activeSensor?.name ?? activeConfig.sensorName) : '';

  return (
    <div className={styles.settingsRoot}>
      {activeConfig && (
        <>
          <SettingsSection title={t('monitoring.settings.design')}>
            <div className={styles.designRow}>
              {designKeysForSlot(widget.size, layout, activeSlot).map(k => {
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
            <LabelControls
              mode={slotLabelMode}
              override={slotLabelOverride}
              autoLabel={slotAutoLabel}
              canType={canEditFreeText(surface, desktopEditor)}
              {...labelControlHandlers(onUpdate, `slot${activeSlot}_labelMode`, `slot${activeSlot}_label`, slotLabelOverride, slotAutoLabel)}
            />
          </SettingsSection>

          {designSupportsRange(activeConfig.design) && (
            <SettingsSection title={t('monitoring.settings.range')}>
              <ChipGroup
                fullWidth
                ariaLabel={t('monitoring.settings.range')}
                activeKey={activeConfig.scale}
                onChange={v => onUpdate({ [`slot${activeSlot}_scale`]: v })}
                options={SCALE_OPTIONS.map(o => ({ key: o.value, label: t(o.labelKey) }))}
              />
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

          {sensorSupportsValueColor(activeSensor?.type) && designSupportsValueColor(activeConfig.design) && (
            <SettingsSection title={t('monitoring.settings.colors')}>
              <SettingsToggle
                label={t('monitoring.settings.valueColor')}
                description={t('monitoring.settings.valueColorHint')}
                checked={slotValueColor}
                onChange={next => onUpdate({ [`slot${activeSlot}_valueColor`]: next })}
              />
              {slotValueColor && <GaugeGradientSection />}
            </SettingsSection>
          )}
        </>
      )}
    </div>
  );
}
