// Pure helpers for the "monitoring" deck action: sensor resolution and the
// tile's chart domain math. Kept free of React so the domain math is unit
// testable, and shared verbatim between the touch-widget tile and the
// physical-deck grid preview (both render through DeckMonitoringCell).
import type { HardwareSensor, SensorState } from '../../../hooks/useSensors';
import type { SensorExtras } from '../../../hooks/useSensorExtras';
import { resolveSensor } from '../monitoring/MonitoringWidget';
import { isExtrasBackedDevice, type DeviceKey } from '../monitoring/perfSlots';
import type { ScaleMode } from '../monitoring/perfDomain';
import type { DeckMonitoringCategory } from './types';

// Every category the monitoring widget's picker offers, in its order, minus
// 'gpu2' and 'igpu': the physical key is rendered service-side
// (SensorSnapshotResolver), which knows "gpu" as every card flattened and
// nothing narrower, so such a key would read "--" on the hardware.
// deckMonitoring.test asserts this stays equal to sensorPicker.ts'
// DEVICE_OPTION_KEYS without those two.
export const DECK_MONITORING_CATEGORIES: readonly DeckMonitoringCategory[] = [
  'quick', 'cpu', 'gpu', 'memory', 'memoryModule', 'motherboard',
  'storage', 'smart', 'network', 'fps',
  'battery', 'cooler', 'psu', 'embeddedController',
];

/**
 * Whether a category resolves out of the "extras" topic, so a caller knows to
 * subscribe (useSensorExtras). Wider than the widget's isExtrasBackedDevice
 * by 'network': a deck key sums the NIC throughput sensors extras carries
 * (buildNicNetworkSensors) rather than the widget's per-process rates, since
 * that is the only network source nexus-service can reproduce for the
 * physical-deck render.
 */
export function deckCategoryUsesExtras(category: DeckMonitoringCategory): boolean {
  return isExtrasBackedDevice(category) || category === 'network';
}

/** Whether a category needs the "fps" topic, whose subscription starts ETW capture. */
export function deckCategoryUsesFps(category: DeckMonitoringCategory): boolean {
  return category === 'fps';
}

export const DECK_MONITORING_DEFAULT_COLOR = '#4da3ff';
export const DECK_MONITORING_TILE_BG = '#0e1116';

/**
 * History-buffer key, deliberately equal to MonitoringWidget's PerfSlot
 * convention so a deck tile and a widget slot watching the same sensor fill
 * one shared buffer.
 *
 * Network is the exception: both sides would build `network::Network Total`,
 * but they resolve DIFFERENT series behind that name - the widget sums
 * per-process rates (buildNetworkSensors), a deck key sums NIC throughput
 * (buildNicNetworkSensors). pushPanelSensorSample keeps only the first sample
 * per key per frame, so sharing would let whichever mounted first own the
 * buffer and draw its series under the other's value text. Scoping the deck's
 * network key keeps the two apart.
 */
export function monitoringSensorKey(category: DeckMonitoringCategory, sensorId: string): string {
  const scope = category === 'network' ? 'deck-network' : category;
  return `${scope}::${sensorId || 'default'}`;
}

/**
 * Resolves the stored (category, concrete sensor id) against live sensor
 * state via MonitoringWidget.resolveSensor. Its cpu/gpu branches special-case
 * a sensorKey literally equal to the string 'Temperature' as the preferred-
 * sensor sentinel regardless of tempPrefs. The picker only ever stores a
 * concrete HardwareSensor.id for those two categories (network and fps store
 * a sensor NAME instead - see sensorsForDevice), so that string never occurs
 * here and the sentinel branch is unreachable in practice.
 *
 * `networkSensors` must come from buildNicNetworkSensors, not
 * buildNetworkSensors: the aggregate the physical deck renders is summed
 * service-side over the same NIC components. Callers that hold none of the
 * gated sources (a preview, a provider-less mount) pass empty ones and the
 * matching categories resolve to undefined, the same unresolved placeholder
 * an absent sensor id already produces.
 */
export function resolveMonitoringSensor(
  sensors: SensorState,
  category: DeckMonitoringCategory,
  sensorId: string,
  fpsSensors: HardwareSensor[],
  networkSensors: HardwareSensor[],
  extras: SensorExtras,
): HardwareSensor | undefined {
  return resolveSensor(sensors, fpsSensors, networkSensors, category as DeviceKey, sensorId, undefined, extras);
}

/**
 * Chart domain for the tile's line/radial styles: 'Load', 'Temperature',
 * 'Control', and 'Level' sensor types use a fixed 0-100 domain (temperature
 * stays in Celsius here - display-unit conversion is formatting-only, see
 * sensorValueFormat.formatSensorValue); every other sensor type adapts to the
 * observed min/max of its own history. The returned domain can be degenerate
 * (min === max, e.g. fewer than 2 distinct observed values) - callers decide
 * how to present that (see monitoringFillFraction and monitoringLineDomain).
 */
export function monitoringTileDomain(
  sensorType: string | undefined,
  history: readonly number[],
  rawValue: number,
): [number, number] {
  if (sensorType === 'Load' || sensorType === 'Temperature' || sensorType === 'Control' || sensorType === 'Level') {
    return [0, 100];
  }
  let min = rawValue;
  let max = rawValue;
  for (const v of history) {
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min)) min = 0;
  if (!Number.isFinite(max)) max = 0;
  return [min, max];
}

/**
 * Fill fraction for the 'segments' tile style: value against the domain's
 * upper bound (min is not subtracted - a Fixed 0-100 domain already floors at
 * 0, and an adaptive domain's floor only shapes the line chart's axis, not
 * the fill), clamped [0, 1]. A degenerate domain (fewer than 2 distinct
 * observed values, so min === max) renders at a neutral half-fill rather than
 * snapping to empty or full.
 */
export function monitoringFillFraction(rawValue: number, domain: readonly [number, number]): number {
  const [min, max] = domain;
  if (!(max > min)) return 0.5;
  if (!Number.isFinite(max) || max === 0) return 0;
  return Math.max(0, Math.min(1, rawValue / max));
}

/**
 * Line-style domain: same as monitoringTileDomain, except a degenerate
 * (min === max) domain widens by 1 on each side so the sparkline draws a
 * visible flat line centered in its chart area instead of collapsing to a
 * single pixel row.
 */
export function monitoringLineDomain(domain: readonly [number, number]): [number, number] {
  const [min, max] = domain;
  return max > min ? [min, max] : [min - 1, max + 1];
}

/**
 * User-typed [min, max] domain override for `scale: 'fixed'`. Returns
 * undefined (adaptive fallback) unless scale is 'fixed' and both bounds are
 * finite with max strictly greater than min - callers combine this with
 * monitoringTileDomain via `??` so an invalid or absent range is silently
 * adaptive rather than crashing the fill/axis math.
 */
export function monitoringFixedDomain(
  scale: ScaleMode | undefined,
  min: number | undefined,
  max: number | undefined,
): [number, number] | undefined {
  if (scale !== 'fixed') return undefined;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return undefined;
  if (!((max as number) > (min as number))) return undefined;
  return [min as number, max as number];
}
