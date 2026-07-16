import type { HardwareSensor } from '../../../../hooks/useSensors';
import { localizeNumbers, type NumberFormat } from '../../../../lib/units';

export function formatRate(bytesPerSec: number, numberFormat: NumberFormat): string {
  if (bytesPerSec >= 1024 * 1024) return localizeNumbers(`${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`, numberFormat);
  if (bytesPerSec >= 1024) return localizeNumbers(`${(bytesPerSec / 1024).toFixed(1)} KB/s`, numberFormat);
  return localizeNumbers(`${Math.round(bytesPerSec)} B/s`, numberFormat);
}

// hwinfo64-style ordering: temps and loads first, then clocks, power, voltage,
// fans, capacities, then everything else. Sensors that don't match a bucket
// drop to "other" so we never silently lose data.
const SENSOR_TYPE_ORDER = [
  'Temperature', 'Load', 'Level', 'Control', 'Clock', 'Frequency',
  'Power', 'Energy', 'Voltage', 'Current',
  'Fan', 'Flow', 'Noise',
  'Data', 'SmallData', 'Throughput',
  'Factor', 'TimeSpan', 'Text',
];

export function groupByType(list: HardwareSensor[]): Array<{ type: string; sensors: HardwareSensor[] }> {
  const map = new Map<string, HardwareSensor[]>();
  for (const s of list) {
    const key = s.type || 'Other';
    const arr = map.get(key);
    if (arr) arr.push(s); else map.set(key, [s]);
  }
  const ordered: Array<{ type: string; sensors: HardwareSensor[] }> = [];
  for (const t of SENSOR_TYPE_ORDER) {
    const arr = map.get(t);
    if (arr && arr.length > 0) {
      ordered.push({ type: t, sensors: arr });
      map.delete(t);
    }
  }
  for (const [type, arr] of map) ordered.push({ type, sensors: arr });
  return ordered;
}
