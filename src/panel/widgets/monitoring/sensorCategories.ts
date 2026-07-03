import type { HardwareSensor, SensorState } from '../../../hooks/useSensors';

// Shared category set for both sensor pickers (monitoring widget + Tryx
// overlay) so the two can never list different devices.
export const SENSOR_CATEGORIES = ['cpu', 'gpu', 'memory', 'motherboard', 'storage', 'network', 'fps'] as const;
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
    case 'cpu': return sensors.cpu;
    case 'gpu': return sensors.gpu;
    case 'memory': return sensors.memory;
    case 'motherboard': return sensors.motherboard;
    case 'storage': return sensors.storageSensors;
    case 'network': return networkSensors;
    case 'fps': return fpsSensors.length ? fpsSensors : FPS_SENSOR_TEMPLATE;
  }
}
