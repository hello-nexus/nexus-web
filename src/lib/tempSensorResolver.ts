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

/** Minimal shape of a /cooling/sources entry needed to pick a default. */
interface CurveSourceLike {
  id: string;
  name: string;
  category: string;
}

/**
 * Default temperature SOURCE id for a new or preset fan curve. Mirrors the
 * service's FanProfiles.PreferredInput so the choice is identical on every
 * platform (each reports a different CPU sensor, but all categorise it "CPU"):
 *
 *   1. The user's pinned CPU sensor, when its id is actually a cooling source
 *      (future-proof / when the monitoring + cooling id spaces coincide).
 *   2. A CPU-category source whose name mentions "Package" (Intel/LHM).
 *   3. Any CPU-category source (e.g. Linux k10temp Tctl, mac CPU die).
 *   4. First source — last resort so a curve is never left with no input.
 *
 * Critically NOT `sources[0]`, which on Linux is often a motherboard SuperIO
 * channel (e.g. an unconnected it8696 header reading a -55°C sentinel).
 */
export function defaultCurveSourceId(
  sources: readonly CurveSourceLike[],
  preferredCpuSourceId = '',
): string {
  if (sources.length === 0) return '';
  if (preferredCpuSourceId) {
    const pinned = sources.find(s => s.id === preferredCpuSourceId);
    if (pinned) return pinned.id;
  }
  const cpu = sources.filter(s => s.category === 'CPU');
  const pkg = cpu.find(s => s.name.toLowerCase().includes('package'));
  return (pkg ?? cpu[0] ?? sources[0]).id;
}
