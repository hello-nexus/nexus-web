import type { HardwareSensor } from '../hooks/useSensors';

// Default-picker rules duplicated from the three places this lives in today
// (CoolingView, MonitoringView OverviewTab, CoolingWidget). Keep them in sync
// when adding new fallback paths so the "auto" branch matches what each view
// used to do on its own.

export function defaultCpuTempSensor(cpuSensors: readonly HardwareSensor[]): HardwareSensor | undefined {
  return (
    cpuSensors.find(s => s.type === 'Temperature') ??
    cpuSensors.find(s => s.id.toLowerCase().includes('temp'))
  );
}

export function defaultGpuTempSensor(gpuSensors: readonly HardwareSensor[]): HardwareSensor | undefined {
  return (
    gpuSensors.find(s => s.type === 'Temperature') ??
    gpuSensors.find(s => s.id.toLowerCase().includes('temperature')) ??
    gpuSensors.find(s => s.id.toLowerCase().includes('temp'))
  );
}

/**
 * Pick the CPU temperature sensor to display. When the user has chosen a
 * specific sensor AND that sensor is still being reported on the live topic,
 * return it. Otherwise fall back to the per-view default (first sensor whose
 * type is "Temperature").
 *
 * Reading the live sensor list is essential: hardware swaps and driver
 * restarts can rotate sensor ids, and we never want to display nothing when
 * a stale preference points at a sensor that no longer exists.
 */
export function resolveCpuTempSensor(
  cpuSensors: readonly HardwareSensor[],
  preferredId: string,
): HardwareSensor | undefined {
  if (preferredId) {
    const match = cpuSensors.find(s => s.id === preferredId);
    if (match) return match;
  }
  return defaultCpuTempSensor(cpuSensors);
}

export function resolveGpuTempSensor(
  gpuSensors: readonly HardwareSensor[],
  preferredId: string,
): HardwareSensor | undefined {
  if (preferredId) {
    const match = gpuSensors.find(s => s.id === preferredId);
    if (match) return match;
  }
  return defaultGpuTempSensor(gpuSensors);
}

/** List every temperature-type sensor in `list` (used to populate the picker). */
export function listTempSensors(list: readonly HardwareSensor[]): HardwareSensor[] {
  return list.filter(s => s.type === 'Temperature');
}
