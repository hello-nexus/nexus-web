// resolveSensor/labelForDevice/percentForSensor are the pure helpers
// MonitoringWidget and PerfSlot use, not consumed elsewhere.
// staticMaxForDevice lives in perfDomain.ts; re-exported here for its
// existing importers (MicroMonitoringWidget, MonitoringWidget.test).

import { useId, useMemo, type CSSProperties } from 'react';
import { useSensors } from '../../../hooks/useSensors';
import type { HardwareSensor } from '../../../hooks/useSensors';
import { EMPTY_SENSOR_EXTRAS, useSensorExtras } from '../../../hooks/useSensorExtras';
import type { SensorExtras } from '../../../hooks/useSensorExtras';
import { useFpsSensors } from '../../../hooks/useFpsSensors';
import { useNetworkMonitor } from '../../../hooks/useNetworkMonitor';
import { useTempSensorPrefs, useUnitPrefs } from '../../../hooks/useUiSettings';
import { resolveCpuTempSensor, resolveGpuTempSensor } from '../../../lib/tempSensorResolver';
import type { WidgetProps } from '../types';
import { useSharedSensorHistory } from '../common/useSharedSensorHistory';
import { GAUGE_DESIGNS } from './gauges';
import type { GaugeDesignKey, GaugeProps } from './gauges';
import { DEFAULT_DESIGN, DEFAULT_SLOTS, isExtrasBackedDevice, isFullBleedRound, isHeroLayout, isMicroLayout, resolvedSlotLayout, resolveSlotDesign } from './perfSlots';
import type { DeviceKey } from './perfSlots';
import { prefixedSensorLabel } from './sensorNames';
import { extrasSensorsForDevice, smartStorageSensors } from './sensorCategories';
import { MicroMonitoringWidget } from './MicroMonitoringWidget';
import { buildNetworkSensors, networkMaxValue, NETWORK_SENSOR_TOTAL } from './networkSensors';
import { formatSensorValue } from './sensorValueFormat';
import { chartDomainForScale, DEFAULT_SCALE_MODE, defaultFixedMax, designIsFill, fixedFillPercent, isHeterogeneousTypeDevice, staticMaxForDevice, type ScaleMode } from './perfDomain';
import { usePanelGaugeGradient, type PanelGaugeGradientValue } from '../common/PanelGaugeGradientContext';
import { remapGaugeGradientToDomain } from '../../theme/gaugeGradient';
import { designSupportsValueColor, gaugeAccentVars, sensorSupportsValueColor } from './valueColor';
import { accentShadowAlpha } from '../../../lib/settings';
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
  sensorKey: string,
  tempPrefs?: TempSensorPrefs,
  extras?: SensorExtras,
): HardwareSensor | undefined {
  switch (device) {
    case 'quick':
      return sensorKey
        ? sensors.summary.find(s => s.id === sensorKey)
          ?? sensors.summary.find(s => s.name === sensorKey)
          ?? sensors.summary[0]
        : sensors.summary[0];
    case 'cpu':
      if (sensorKey === 'Temperature') {
        return resolveCpuTempSensor(sensors.cpu, tempPrefs?.cpuId ?? '');
      }
      return sensorKey
        ? sensors.cpu.find(s => s.id === sensorKey)
          ?? sensors.cpu.find(s => s.name === sensorKey)
          ?? sensors.cpu.find(s => s.name === 'CPU Total')
        : sensors.cpu.find(s => s.name === 'CPU Total') ?? sensors.cpu[0];
    case 'gpu':
      if (sensorKey === 'Temperature') {
        return resolveGpuTempSensor(sensors.gpu, tempPrefs?.gpuId ?? '');
      }
      return sensorKey
        ? sensors.gpu.find(s => s.id === sensorKey)
          ?? sensors.gpu.find(s => s.name === sensorKey)
          ?? sensors.gpu.find(s => s.name === 'GPU Core' && s.type === 'Load')
          ?? sensors.gpu[0]
        : sensors.gpu.find(s => s.name === 'GPU Core' && s.type === 'Load') ?? sensors.gpu[0];
    case 'memory':
      return sensorKey
        ? sensors.memory.find(s => s.id === sensorKey)
          ?? sensors.memory.find(s => s.name === sensorKey)
          ?? sensors.memory.find(s => s.name === 'Memory Usage')
        : sensors.memory.find(s => s.name === 'Memory Usage') ?? sensors.memory[0];
    case 'motherboard':
      return sensorKey
        ? sensors.motherboard.find(s => s.id === sensorKey)
          ?? sensors.motherboard.find(s => s.name === sensorKey)
          ?? sensors.motherboard[0]
        : sensors.motherboard[0];
    case 'fan':
      return sensorKey
        ? sensors.motherboard.find(s => s.id === sensorKey)
          ?? sensors.motherboard.find(s => s.type === 'Fan' && s.name === sensorKey)
          ?? sensors.motherboard.find(s => s.type === 'Fan')
        : sensors.motherboard.find(s => s.type === 'Fan');
    case 'storage':
      return sensors.storageSensors.find(s => s.id === sensorKey)
        ?? sensors.storageSensors.find(s => s.name === sensorKey)
        ?? sensors.storageSensors[0];
    case 'smart': {
      const list = smartStorageSensors(sensors);
      return sensorKey
        ? list.find(s => s.id === sensorKey) ?? list.find(s => s.name === sensorKey) ?? list[0]
        : list[0];
    }
    case 'memoryModule':
    case 'battery':
    case 'cooler':
    case 'psu':
    case 'embeddedController': {
      const list = extrasSensorsForDevice(device, extras ?? EMPTY_SENSOR_EXTRAS);
      return sensorKey
        ? list.find(s => s.id === sensorKey) ?? list.find(s => s.name === sensorKey) ?? list[0]
        : list[0];
    }
    case 'network':
      return sensorKey
        ? networkSensors.find(s => s.name === sensorKey) ?? networkSensors.find(s => s.name === NETWORK_SENSOR_TOTAL)
        : networkSensors.find(s => s.name === NETWORK_SENSOR_TOTAL);
    case 'fps':
      return sensorKey
        ? fpsSensors.find(s => s.name === sensorKey)
        : fpsSensors[0];
    default:
      return undefined;
  }
}

export function labelForDevice(device: DeviceKey, sensorName: string): string {
  if (sensorName) return prefixedSensorLabel(device, sensorName);
  switch (device) {
    case 'quick': return 'Quick';
    case 'cpu': return 'CPU';
    case 'gpu': return 'GPU';
    case 'memory': return 'RAM';
    case 'motherboard': return 'MB';
    case 'fan': return 'FAN';
    case 'storage': return 'Storage';
    case 'smart': return 'SMART';
    case 'memoryModule': return 'DIMM';
    case 'battery': return 'BATT';
    case 'cooler': return 'COOL';
    case 'psu': return 'PSU';
    case 'embeddedController': return 'EC';
    case 'network': return 'Network';
    case 'fps': return 'FPS';
  }
}

export { staticMaxForDevice };

// A slot/sensor caption has three modes stored as `labelMode` (absent = auto):
// 'hide' blanks it, 'custom' shows the stored `label` (falling back to the
// derived name until the user types), auto shows the derived name. The stored
// custom text is retained across mode switches; only Reset clears it, so the
// caller keeps it in `label` regardless of the active mode.
export function displayLabel(mode: string | undefined, override: string | undefined, autoLabel: string): string {
  if (mode === 'hide') return '';
  if (mode === 'custom') return override?.trim() || autoLabel;
  return autoLabel;
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
  if (isHeterogeneousTypeDevice(device)) {
    // Motherboard and the other mixed-bag device categories (SSD SMART,
    // the extras-topic groups) are heterogeneous: Load/Control/Level and
    // Temperature already read 0-100, everything else (Fan, Voltage, Clock)
    // needs to scale against the resolved ceiling.
    if (sensor.type === 'Load' || sensor.type === 'Control' || sensor.type === 'Level' || sensor.type === 'Temperature') {
      return Math.max(0, Math.min(100, sensor.value));
    }
    return Math.min(100, (sensor.value / maxValue) * 100);
  }
  if (device === 'fan' || device === 'network' || device === 'fps') {
    return Math.min(100, (sensor.value / maxValue) * 100);
  }
  // Load sensors already report 0-100 percent.
  return Math.max(0, Math.min(100, sensor.value));
}

export function MonitoringWidget({ widget, selectedSlot, onSelectSlot }: WidgetProps) {
  const layout = resolvedSlotLayout(widget.size, widget.config);
  const count = layout.count;
  const isMicro = isMicroLayout(widget.size, count, layout.hero);

  // Slot configs for both modes. In Micro mode the slot{N}_* keys are read
  // only to decide whether the lazy fps/network hooks need to subscribe; the
  // render path ignores them.
  const slotConfigs = Array.from({ length: count }, (_, i) => ({
    device: ((widget.config?.[`slot${i}_device`] as DeviceKey | undefined) ?? DEFAULT_SLOTS[i]?.device ?? 'cpu'),
    sensorName: ((widget.config?.[`slot${i}_sensor`] as string | undefined) ?? DEFAULT_SLOTS[i]?.sensor ?? ''),
    // Clamped to what the slot may show: a Hero small cell narrows the set, and
    // a design stored before the layout switch would render outside its picker.
    design: resolveSlotDesign(
      widget.size,
      layout,
      i,
      ((widget.config?.[`slot${i}_design`] as GaugeDesignKey | undefined) ?? DEFAULT_SLOTS[i]?.design ?? DEFAULT_DESIGN),
    ),
    scale: ((widget.config?.[`slot${i}_scale`] as ScaleMode | undefined) ?? DEFAULT_SCALE_MODE),
    fixedMin: widget.config?.[`slot${i}_min`] as number | undefined,
    fixedMax: widget.config?.[`slot${i}_max`] as number | undefined,
    valueColor: (widget.config?.[`slot${i}_valueColor`] as boolean | undefined) ?? false,
    labelOverride: widget.config?.[`slot${i}_label`] as string | undefined,
    labelMode: widget.config?.[`slot${i}_labelMode`] as string | undefined,
  }));
  const microDevice = widget.config?.micro_device as DeviceKey | undefined;
  const usesFps = isMicro
    ? microDevice === 'fps'
    : slotConfigs.some(slot => slot.device === 'fps');
  const usesNetwork = isMicro
    ? microDevice === 'network'
    : slotConfigs.some(slot => slot.device === 'network');
  const usesExtras = isMicro
    ? isExtrasBackedDevice(microDevice ?? 'cpu')
    : slotConfigs.some(slot => isExtrasBackedDevice(slot.device));
  // Call hooks unconditionally (no branch, no early return) or the hooks-order
  // guard trips when slot count toggles between Micro (3/4) and multi (1/2/4).
  const sensors = useSensors(true);
  const fpsSensors = useFpsSensors(usesFps);
  const network = useNetworkMonitor(usesNetwork);
  const networkSensors = buildNetworkSensors(network);
  const extras = useSensorExtras(usesExtras);
  const tempPrefs: TempSensorPrefs = useTempSensorPrefs();
  const gaugeGradient = usePanelGaugeGradient();

  if (isMicro) {
    return <MicroMonitoringWidget widget={widget} count={count} selectedSlot={selectedSlot} onSelectSlot={onSelectSlot} />;
  }

  const selectable = typeof onSelectSlot === 'function';
  const activeSlot = selectedSlot == null
    ? 0
    : Math.max(0, Math.min(selectedSlot, count - 1));

  const layoutClass = isHeroLayout(widget.size, count, layout.hero) ? styles.gridHero
    : count >= 4 ? styles.grid2x2
    : count === 2 && (widget.size === '4x4' || widget.size === '2x4') ? styles.grid2row
    : count === 2 ? styles.grid2col
    : styles.solo;
  // A frame-filling design on the round glass scales its figure to the rim.
  const fullBleed = isFullBleedRound(widget.size, widget.config);

  return (
    <div className={`${styles.performance} ${layoutClass}${fullBleed ? ` ${styles.fullBleed}` : ''}`}>
      {slotConfigs.map(({ device, sensorName, design, scale, fixedMin, fixedMax, valueColor, labelOverride, labelMode }, i) => {
        return (
          <PerfSlot
            key={`${i}-${device}-${sensorName}`}
            slotIndex={i}
            sensors={sensors}
            fpsSensors={fpsSensors}
            networkSensors={networkSensors}
            extras={extras}
            device={device}
            sensorName={sensorName}
            design={design}
            scale={scale}
            fixedMin={fixedMin}
            fixedMax={fixedMax}
            valueColor={valueColor}
            gaugeGradient={gaugeGradient}
            labelOverride={labelOverride}
            labelMode={labelMode}
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
  extras?: SensorExtras;
  device: DeviceKey;
  sensorName: string;
  design: GaugeDesignKey;
  scale?: ScaleMode;
  fixedMin?: number;
  fixedMax?: number;
  /** Paint the panel's gauge gradient into this slot (percent / temperature sensors). */
  valueColor?: boolean;
  gaugeGradient?: PanelGaugeGradientValue;
  labelOverride?: string;
  labelMode?: string;
  tempPrefs?: TempSensorPrefs;
  selected?: boolean;
  onSelect?: () => void;
}

export function PerfSlot({ slotIndex, sensors, fpsSensors, networkSensors, extras, device, sensorName, design, scale = DEFAULT_SCALE_MODE, fixedMin, fixedMax, valueColor = false, gaugeGradient, labelOverride, labelMode, tempPrefs, selected = false, onSelect }: PerfSlotProps) {
  const { monitoringTempUnit, numberFormat } = useUnitPrefs();
  const effectiveSensorName = device === 'network' && !sensorName ? NETWORK_SENSOR_TOTAL : sensorName;
  const sensor = resolveSensor(sensors, fpsSensors, networkSensors, device, effectiveSensorName, tempPrefs, extras);
  const rawValue = sensor?.value ?? 0;
  const formatted = sensor ? formatSensorValue(sensor.value, sensor.units, sensor.formatted, monitoringTempUnit, numberFormat) : '-';
  // Auto / hide / custom caption; the stored custom text survives sensor
  // changes and mode switches. The a11y name stays meaningful even when hidden.
  const autoLabel = labelForDevice(device, sensor?.name ?? effectiveSensorName);
  const label = displayLabel(labelMode, labelOverride, autoLabel);
  const resolvedLabel = labelMode === 'custom' ? (labelOverride?.trim() || autoLabel) : autoLabel;
  // Shared key so the tile + immersive instance for the same sensor share one
  // 60-sample buffer; re-mounting in immersive shows existing history at once.
  const sensorKey = `${device}::${effectiveSensorName || 'default'}`;
  const history = useSharedSensorHistory(sensorKey, rawValue) as number[];
  const sensorMax = sensor?.theoreticalMaximum && sensor.theoreticalMaximum > 0 ? sensor.theoreticalMaximum : 0;
  const maxValue = device === 'network'
    ? networkMaxValue(rawValue, history)
    : sensorMax || staticMaxForDevice(device, sensor?.name, sensor?.type);
  const fixedDefaultMax = defaultFixedMax(device, sensor, effectiveSensorName);
  const [domainMin, domainMax] = chartDomainForScale(device, rawValue, history, maxValue, scale, sensor?.name, sensor?.type, fixedMin, fixedMax, fixedDefaultMax);
  // Value-fill gauges scale to the Fixed [min, max] window when set; otherwise
  // (and for every history design) the natural percent fill is used.
  const value = scale === 'fixed' && designIsFill(design)
    ? fixedFillPercent(rawValue, domainMin, domainMax)
    : percentForSensor(device, sensor, maxValue);
  // Stable tuple reference so the Sparkline path-memo keys on bound values,
  // not array identity.
  const historyDomain = useMemo<[number, number]>(() => [domainMin, domainMax], [domainMin, domainMax]);

  // The gradient describes the sensor's own scale: the Fixed window when set,
  // else the natural percent (0-100 for a load or a temperature, the sensor's
  // capacity for a Data sensor). Every design colours by that scale, so a
  // chart stretched to the recent history still colours 36 degrees as cool.
  const naturalMax = sensor?.theoreticalMaximum && sensor.theoreticalMaximum > 0 ? sensor.theoreticalMaximum : 100;
  const scaleFraction = scale === 'fixed'
    ? fixedFillPercent(rawValue, domainMin, domainMax) / 100
    : percentForSensor(device, sensor, maxValue) / 100;
  const gradientId = useId();
  const coloured = valueColor && !!gaugeGradient && designSupportsValueColor(design) && sensorSupportsValueColor(sensor?.type);
  // Stable identity: the arc gauges memoise their coloured geometry on it, and
  // a fresh object per tick would rebuild forty paths a second. A history
  // chart plots [domainMin, domainMax], so its copy of the stops is re-expressed
  // over that window and only changes when the window does.
  const stops = coloured ? gaugeGradient.stops : null;
  const mode = gaugeGradient?.mode ?? 'dark';
  const chart = !designIsFill(design);
  const gradient = useMemo(() => {
    if (!stops) return null;
    const bodyAlpha = accentShadowAlpha(mode);
    if (!chart) return { id: gradientId, stops, bodyAlpha };
    const valueAt = scale === 'fixed'
      ? (at: number) => domainMin + at * (domainMax - domainMin)
      : (at: number) => at * naturalMax;
    return { id: gradientId, stops: remapGaugeGradientToDomain(stops, valueAt, domainMin, domainMax), bodyAlpha };
  }, [gradientId, stops, mode, chart, scale, domainMin, domainMax, naturalMax]);
  // Tints the number and glow to the reading; the figure carries the whole
  // gradient, so the two together read like a tachometer.
  const gradeStyle = coloured
    ? gaugeAccentVars(gaugeGradient.stops, scaleFraction, gaugeGradient.mode) as CSSProperties
    : undefined;

  const GaugeComponent = GAUGE_DESIGNS[design] ?? GAUGE_DESIGNS.sparkline;

  const props: GaugeProps = {
    value,
    rawValue,
    formatted,
    label,
    history,
    maxValue,
    historyDomain,
    gradient,
  };

  // The tint rides on an inner layout-less wrapper so the slot's own chrome
  // (the editor's selection ring) keeps the panel accent.
  const content = gradeStyle
    ? <div className={styles.slotPaint} style={gradeStyle}><GaugeComponent {...props} /></div>
    : <GaugeComponent {...props} />;

  if (!onSelect) {
    return <div className={styles.slot} data-monitoring-slot-index={slotIndex}>{content}</div>;
  }

  return (
    <button
      type="button"
      data-monitoring-slot-index={slotIndex}
      className={`${styles.slot} ${styles.slotSelectable} ${selected ? styles.slotSelected : ''}`}
      aria-pressed={selected}
      aria-label={`Select ${resolvedLabel}`}
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
