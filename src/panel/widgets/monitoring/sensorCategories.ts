import { isSmartStorageComponentId, type HardwareSensor, type SensorState } from '../../../hooks/useSensors';
import type { SensorExtras } from '../../../hooks/useSensorExtras';
import type { GpuComponent } from '../../../lib/gpuResolver';
import type { DeviceKey } from './perfSlots';

// Shared category set for both sensor pickers (monitoring widget + Tryx
// overlay) so the two can never list different devices.
export const SENSOR_CATEGORIES = ['quick', 'cpu', 'gpu', 'memory', 'motherboard', 'storage', 'network', 'fps'] as const;
export type SensorCategory = typeof SENSOR_CATEGORIES[number];

// Ids/types mirror WindowsFpsProvider's `fps/current` / `fps/frame-time`
// sensors exactly, so a picker built from this template resolves the same
// sensor once a real FPS capture starts.
export const FPS_SENSOR_TEMPLATE: HardwareSensor[] = [
  { id: 'fps/current', name: 'FPS', type: 'Framerate', value: 0, units: 'fps', formatted: '0fps', parent: { id: 'fps', name: 'FPS' } },
  { id: 'fps/frame-time', name: 'Frame Time', type: 'FrameTime', value: 0, units: 'ms', formatted: '0.0ms', parent: { id: 'fps', name: 'FPS' } },
];

/**
 * Sensor list for one picker category. `sensorsForCategory` is the single
 * source both MonitoringSettings and the Tryx overlay picker resolve
 * against, so they can't drift into different sensor sets.
 */
export function sensorsForCategory(
  category: SensorCategory,
  sensors: SensorState,
  networkSensors: HardwareSensor[],
  fpsSensors: HardwareSensor[],
): HardwareSensor[] {
  switch (category) {
    case 'quick': return sensors.summary;
    case 'cpu': return sensors.cpu;
    case 'gpu': return sensors.gpu;
    case 'memory': return sensors.memory;
    case 'motherboard': return sensors.motherboard;
    case 'storage': return sensors.storageSensors;
    case 'network': return networkSensors;
    case 'fps': return fpsSensors.length ? fpsSensors : FPS_SENSOR_TEMPLATE;
  }
}

// ── Widget-only categories ──────────────────────────────────────────────────
// Not part of SENSOR_CATEGORIES/SensorCategory above: the Tryx overlay picker
// (TRYX_SENSOR_GROUPS in tryxOverlayUtils.ts) mirrors that exact set, and
// must never offer the iGPU, SSD SMART or the extras-topic device groups (see
// useSensors.storageSensors and useSensorExtras for why).

/**
 * Discrete cards other than the primary one, recognised by sensor id (ids are
 * unique across GPUs, so two identically named cards still split). Unlike
 * `igpuComponents` this follows the preferred-GPU setting: flipping it swaps
 * which card is "GPU" and which "GPU 2", so a gpu2 slot keyed by the old
 * second card's id falls back to a same-named sensor on the new one. Offered
 * as one "GPU 2" category: with three or more discrete cards their sensors
 * share the list under bare names, the known limit. Empty on every box with
 * at most one discrete card. Widget-only for the same reason as
 * `igpuComponents`.
 */
export function gpu2Components(sensors: SensorState): GpuComponent[] {
  const primaryIds = new Set(sensors.gpu.map(s => s.id));
  return sensors.gpuComponents.filter(g => !g.integrated && !g.sensors.some(s => primaryIds.has(s.id)));
}

/** Flattened sensors of `gpu2Components`. */
export function gpu2Sensors(sensors: SensorState): HardwareSensor[] {
  return gpu2Components(sensors).flatMap(g => g.sensors);
}

/**
 * The integrated GPU(s), offered only beside a discrete card: on an iGPU-only
 * box the 'gpu' category already is the iGPU, so this is empty and the picker
 * hides the category rather than listing one card twice. Not "the GPUs other
 * than the primary": with the iGPU picked as preferred GPU on a dual box both
 * categories show it, and an 'igpu' slot keeps resolving instead of blanking.
 * Widget-only: the Tryx overlay and the deck resolve sensors service-side,
 * where only "gpu" (every card flattened) exists as a category.
 */
export function igpuComponents(sensors: SensorState): GpuComponent[] {
  const gpus = sensors.gpuComponents;
  if (!gpus.some(g => !g.integrated)) return [];
  return gpus.filter(g => g.integrated);
}

/** Flattened sensors of `igpuComponents`. */
export function igpuSensors(sensors: SensorState): HardwareSensor[] {
  return igpuComponents(sensors).flatMap(g => g.sensors);
}

/** Flattened sensors from every smart/*-keyed storage component. */
export function smartStorageSensors(sensors: SensorState): HardwareSensor[] {
  return Object.entries(sensors.storageComponents)
    .filter(([id]) => isSmartStorageComponentId(id))
    .flatMap(([, component]) => component.sensors ?? []);
}

/** Flattened sensors for one extras-topic device category; [] for any other device. */
export function extrasSensorsForDevice(device: DeviceKey, extras: SensorExtras): HardwareSensor[] {
  switch (device) {
    case 'memoryModule': return extras.memoryModules.flatMap(c => c.sensors ?? []);
    case 'battery': return extras.batteries.flatMap(c => c.sensors ?? []);
    case 'cooler': return extras.coolers.flatMap(c => c.sensors ?? []);
    case 'psu': return extras.psus.flatMap(c => c.sensors ?? []);
    case 'embeddedController': return extras.embeddedControllers.flatMap(c => c.sensors ?? []);
    default: return [];
  }
}
