import { isSmartStorageComponentId, type HardwareSensor, type SensorState } from '../../../hooks/useSensors';
import type { SensorExtras } from '../../../hooks/useSensorExtras';
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
// must never offer SSD SMART or the extras-topic device groups (see
// useSensors.storageSensors and useSensorExtras for why).

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
    case 'nic': return extras.nics.flatMap(c => c.sensors ?? []);
    case 'cooler': return extras.coolers.flatMap(c => c.sensors ?? []);
    case 'psu': return extras.psus.flatMap(c => c.sensors ?? []);
    case 'embeddedController': return extras.embeddedControllers.flatMap(c => c.sensors ?? []);
    default: return [];
  }
}
