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
import { DEFAULT_MICRO_DESIGN, isExtrasBackedDevice, isTwoColumnMicro, type DeviceKey } from './perfSlots';
import type { GaugeDesignKey } from './gauges/types';
import {
  displayLabel,
  percentForSensor,
  resolveSensor,
  staticMaxForDevice,
} from './MonitoringWidget';
import { bareSensorLabel } from './sensorNames';
import { chartDomainForScale, defaultFixedMax, DEFAULT_SCALE_MODE, fixedFillPercent, type ScaleMode } from './perfDomain';
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

  // The bottom device caption ("GPU") is the widget's category label with the
  // same auto/hide/custom model as a sensor caption: 'hide' drops the whole row
  // and lets the bars fill the freed height, 'custom' shows micro_category.
  const categoryMode = widget.config?.micro_categoryMode as string | undefined;
  const categoryHidden = categoryMode === 'hide';
  const bottomLabel = displayLabel(categoryMode, widget.config?.micro_category as string | undefined, bottomLabelForDevice(device, sensors, t));

  // One Fixed range shared by every bar (Micro has no per-slot scale).
  const microScale = (widget.config?.micro_scale as ScaleMode | undefined) ?? DEFAULT_SCALE_MODE;
  const microMin = widget.config?.micro_min as number | undefined;
  const microMax = widget.config?.micro_max as number | undefined;
  // Row style shared by every bar; a 6/8-slot Micro on the wide 4x2 splits the
  // rows into two columns (3+3, 4+4) under the one shared caption. The tall 2x4
  // keeps all rows in one column.
  const microDesign = (widget.config?.micro_design as GaugeDesignKey | undefined) ?? DEFAULT_MICRO_DESIGN;
  const twoColumn = isTwoColumnMicro(widget.size, count);

  const rowEls = sensorNames.map((rawName, i) => (
    <MicroRow
      key={`${i}-${device}-${rawName}`}
      sensors={sensors}
      fpsSensors={fpsSensors}
      networkSensors={networkSensors}
      extras={extras}
      device={device}
      sensorName={rawName}
      labelOverride={widget.config?.[`micro_sensor${i}_label`] as string | undefined}
      labelMode={widget.config?.[`micro_sensor${i}_labelMode`] as string | undefined}
      design={microDesign}
      scale={microScale}
      fixedMin={microMin}
      fixedMax={microMax}
      tempPrefs={tempPrefs}
      monitoringTempUnit={monitoringTempUnit}
      numberFormat={numberFormat}
    />
  ));
  const half = Math.ceil(count / 2);

  return (
    <div className={styles.micro}>
      {twoColumn ? (
        <div className={styles.columns}>
          <div className={styles.rows}>{rowEls.slice(0, half)}</div>
          <div className={styles.rows}>{rowEls.slice(half)}</div>
        </div>
      ) : (
        <div className={styles.rows}>{rowEls}</div>
      )}
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
  labelMode?: string;
  design: GaugeDesignKey;
  scale: ScaleMode;
  fixedMin?: number;
  fixedMax?: number;
  tempPrefs?: { cpuId: string; gpuId: string };
  monitoringTempUnit: TempUnit;
  numberFormat: NumberFormat;
}

function MicroRow({ sensors, fpsSensors, networkSensors, extras, device, sensorName, labelOverride, labelMode, design, scale, fixedMin, fixedMax, tempPrefs, monitoringTempUnit, numberFormat }: MicroRowProps) {
  const effectiveSensorName = device === 'network' && !sensorName ? NETWORK_SENSOR_TOTAL : sensorName;
  const sensor = resolveSensor(sensors, fpsSensors, networkSensors, device, effectiveSensorName, tempPrefs, extras);
  const rawValue = sensor?.value ?? 0;
  const formatted = sensor ? formatSensorValue(sensor.value, sensor.units, sensor.formatted, monitoringTempUnit, numberFormat) : '-';
  const sensorDisplayName = sensor?.name ?? '';
  const autoLabel = bareSensorLabel(device, sensorDisplayName) || sensorDisplayName || effectiveSensorName;
  const label = displayLabel(labelMode, labelOverride, autoLabel);
  const sensorKey = `${device}::${effectiveSensorName || 'default'}`;
  const history = useSharedSensorHistory(sensorKey, rawValue) as number[];
  const maxValue = device === 'network'
    ? networkMaxValue(rawValue, history)
    : staticMaxForDevice(device, sensor?.name, sensor?.type);
  // A shared Fixed range scales every bar to the same [min, max] window;
  // adaptive keeps each bar's natural percent fill.
  const [domainMin, domainMax] = chartDomainForScale(device, rawValue, history, maxValue, scale, sensor?.name, sensor?.type, fixedMin, fixedMax, defaultFixedMax(device, sensor, effectiveSensorName));
  const fillPercent = scale === 'fixed'
    ? fixedFillPercent(rawValue, domainMin, domainMax)
    : percentForSensor(device, sensor, maxValue);

  return (
    <MicroBar
      label={label}
      formatted={formatted}
      fillPercent={fillPercent}
      design={design}
      history={history}
      historyDomain={[domainMin, domainMax]}
    />
  );
}
