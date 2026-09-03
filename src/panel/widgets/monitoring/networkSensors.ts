import type { NetworkData } from '../../../hooks/useNetworkMonitor';
import type { ExtrasComponent } from '../../../hooks/useSensorExtras';
import type { HardwareSensor } from '../../../hooks/useSensors';

export const NETWORK_SENSOR_IN = 'Network In';
export const NETWORK_SENSOR_OUT = 'Network Out';
export const NETWORK_SENSOR_TOTAL = 'Network Total';

export const NETWORK_SENSOR_NAMES = [
  NETWORK_SENSOR_TOTAL,
  NETWORK_SENSOR_IN,
  NETWORK_SENSOR_OUT,
] as const;

const MIN_NETWORK_MAX_BPS = 1024;

export function buildNetworkSensors(network: NetworkData): HardwareSensor[] {
  return [
    networkSensor('network-total', NETWORK_SENSOR_TOTAL, network.totalRate),
    networkSensor('network-in', NETWORK_SENSOR_IN, network.totalRateIn),
    networkSensor('network-out', NETWORK_SENSOR_OUT, network.totalRateOut),
  ];
}

/**
 * The same three aggregate sensors as buildNetworkSensors, summed instead
 * over the NIC throughput sensors carried by the "extras" topic. This is the
 * one network source nexus-web and nexus-service can read identically -
 * nexus-service's SensorSnapshotResolver builds these three from the same
 * components - so a deck monitoring key, whose physical Stream Deck twin is
 * rendered service-side, resolves against these rather than
 * buildNetworkSensors' web-only per-process sums.
 *
 * Direction comes from the sensor name, the only discriminator both sensor
 * providers share: LibreHardwareMonitor names them "Download Speed" /
 * "Upload Speed", LinuxSensorProvider "<iface> RX" / "<iface> TX". Adapters
 * reporting no throughput sensor at all, or only a non-directional one
 * ("Network Utilization"), yield [], which hides the category from a picker
 * instead of offering three flat zeros.
 */
export function buildNicNetworkSensors(nics: readonly ExtrasComponent[]): HardwareSensor[] {
  let bytesIn = 0;
  let bytesOut = 0;
  let matched = false;
  for (const nic of nics) {
    for (const sensor of nic.sensors ?? []) {
      if (sensor.type !== 'Throughput') continue;
      const direction = nicThroughputDirection(sensor.name);
      if (!direction) continue;
      // The adapter counts as present even when this reading is unusable, so
      // one bad NIC hides neither the category nor the other adapters' rates.
      matched = true;
      const value = Number.isFinite(sensor.value) ? Math.max(0, sensor.value) : 0;
      if (direction === 'in') bytesIn += value;
      else bytesOut += value;
    }
  }
  if (!matched) return [];
  return [
    networkSensor('network-total', NETWORK_SENSOR_TOTAL, bytesIn + bytesOut),
    networkSensor('network-in', NETWORK_SENSOR_IN, bytesIn),
    networkSensor('network-out', NETWORK_SENSOR_OUT, bytesOut),
  ];
}

/** Kept behaviourally identical to nexus-service's SensorSnapshotResolver.NicThroughputDirection. */
function nicThroughputDirection(name: string): 'in' | 'out' | null {
  const lower = name.toLowerCase();
  if (lower.includes('download') || lower.endsWith(' rx')) return 'in';
  if (lower.includes('upload') || lower.endsWith(' tx')) return 'out';
  return null;
}

export function networkSensorOptions(): { value: string; label: string }[] {
  return NETWORK_SENSOR_NAMES.map(name => ({ value: name, label: name }));
}

export function networkMaxValue(rawValue: number, history: readonly number[]): number {
  let max = Math.max(MIN_NETWORK_MAX_BPS, rawValue);
  for (let i = 0; i < history.length; i++) {
    if (history[i] > max) max = history[i];
  }
  return niceNetworkCeiling(max);
}

function networkSensor(id: string, name: string, value: number): HardwareSensor {
  const safeValue = Number.isFinite(value) && value > 0 ? value : 0;
  return {
    id,
    name,
    type: 'Rate',
    value: safeValue,
    units: 'B/s',
    formatted: formatNetworkRate(safeValue),
    parent: { id: 'network', name: 'Network' },
  };
}

function formatNetworkRate(bytesPerSecond: number): string {
  const value = Math.max(0, bytesPerSecond);
  if (value < 1024) return `${Math.round(value)} B/s`;

  const units = ['KB/s', 'MB/s', 'GB/s', 'TB/s'];
  let scaled = value / 1024;
  let unitIndex = 0;
  while (scaled >= 1024 && unitIndex < units.length - 1) {
    scaled /= 1024;
    unitIndex++;
  }

  const decimals = scaled < 10 ? 1 : 0;
  return `${scaled.toFixed(decimals)} ${units[unitIndex]}`;
}

function niceNetworkCeiling(value: number): number {
  const exponent = Math.floor(Math.log10(value));
  const magnitude = 10 ** exponent;
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1
    : normalized <= 2 ? 2
    : normalized <= 5 ? 5
    : 10;
  return step * magnitude;
}
