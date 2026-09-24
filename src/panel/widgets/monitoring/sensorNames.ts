import type { DeviceKey } from './perfSlots';

// Devices whose sensors typically arrive with the device category baked into
// the sensor name (e.g. "CPU Total", "Memory Usage", "Network In"). Storage,
// fan, and fps either name themselves (Drive C, Fan 1) or have no useful
// short prefix, so they stay untouched on both display paths.
const DEVICE_PREFIXES: Partial<Record<DeviceKey, string>> = {
  cpu: 'CPU',
  gpu: 'GPU',
  gpu2: 'GPU 2',
  igpu: 'iGPU',
  memory: 'Memory',
  network: 'Network',
};

// A second card's sensors arrive named like any GPU's ("GPU Core"), so the
// gpu2/igpu bare forms strip that word as well as their own caption.
function strippedPrefixes(device: DeviceKey): string[] {
  const prefix = DEVICE_PREFIXES[device];
  if (!prefix) return [];
  return device === 'igpu' || device === 'gpu2' ? [prefix, 'GPU'] : [prefix];
}

// The sensor name with any leading device-category prefix stripped. Used in
// Micro rows (where the bottom label already names the device) and in the
// settings sensor picker (where the device select sits right above). Names
// that already lack the prefix are returned as-is.
export function bareSensorLabel(device: DeviceKey, name: string): string {
  if (!name) return name;
  const lowerName = name.toLowerCase();
  for (const prefix of strippedPrefixes(device)) {
    const lowerPrefix = prefix.toLowerCase();
    if (lowerName === lowerPrefix) return '';
    if (lowerName.startsWith(lowerPrefix + ' ')) return name.slice(prefix.length + 1);
  }
  return name;
}

// "<Device> <Sensor>" form for regular gauges - normalizes both already-
// prefixed names ("CPU Total") and bare names ("Total") to the same canonical
// "CPU Total" output. Idempotent.
export function prefixedSensorLabel(device: DeviceKey, name: string): string {
  const prefix = DEVICE_PREFIXES[device];
  if (!prefix || !name) return name;
  const bare = bareSensorLabel(device, name);
  return bare ? `${prefix} ${bare}` : prefix;
}
