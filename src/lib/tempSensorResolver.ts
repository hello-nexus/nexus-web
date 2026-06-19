import type { HardwareSensor } from '../hooks/useSensors';

// Default-picker rules shared by CoolingView, MonitoringView OverviewTab, and
// CoolingWidget. Keep the "auto" branch in sync across them.

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
 * Pick the CPU temperature sensor to display. Return the user's chosen
 * sensor if it's still on the live topic; otherwise the per-view default
 * (first "Temperature"-type sensor).
 *
 * Matching against the live list handles hardware swaps and driver restarts
 * that rotate sensor ids, so a stale preference never leaves the display
 * blank.
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
 * platform (each reports a different CPU sensor, all categorised "CPU"):
 *
 *   1. The user's pinned CPU sensor, when its id is also a cooling source.
 *   2. A CPU-category source whose name mentions "Package" (Intel/LHM).
 *   3. Any CPU-category source (e.g. Linux k10temp Tctl, mac CPU die).
 *   4. First source - last resort so a curve always has an input.
 *
 * NOT `sources[0]`, which on Linux is often a motherboard SuperIO channel
 * (e.g. an unconnected it8696 header reading a -55°C sentinel).
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
