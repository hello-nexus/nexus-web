import type { LightingDevice } from '../../../../api/lighting';

// The SmartHub's firmware animation is all-or-nothing, so the service widens
// Nexus Control on one of its ports to every port of that hub.
export function controlGroupOf(devices: readonly LightingDevice[], device: LightingDevice): Set<string> {
  if (!device.parentDeviceId?.startsWith('smarthub:')) return new Set([device.id]);
  return new Set(devices.filter(d => d.parentDeviceId === device.parentDeviceId).map(d => d.id));
}
