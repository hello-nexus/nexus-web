import type { HardwareSensor } from '../../../../hooks/useSensors';
import { localizeNumbers, type NumberFormat } from '../../../../lib/units';

export function formatRate(bytesPerSec: number, numberFormat: NumberFormat): string {
  if (bytesPerSec >= 1024 * 1024) return localizeNumbers(`${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`, numberFormat);
  if (bytesPerSec >= 1024) return localizeNumbers(`${(bytesPerSec / 1024).toFixed(1)} KB/s`, numberFormat);
  return localizeNumbers(`${Math.round(bytesPerSec)} B/s`, numberFormat);
}

// Mirrors formatRateParts: 4-char-wide string (1.2, 12.0, 120) so the value
// block stays a stable width and the sparkline doesn't shift between frames.
export function formatPercentParts(percent: number, numberFormat: NumberFormat): { value: string; unit: string } {
  const v = Math.max(0, percent);
  const roundedOneDecimal = Math.round(v * 10) / 10;
  const formatted = roundedOneDecimal >= 100
    ? String(Math.round(roundedOneDecimal))
    : roundedOneDecimal.toFixed(1);
  return { value: localizeNumbers(formatted, numberFormat), unit: '%' };
}

export function formatMemoryPercent(percent: number, numberFormat: NumberFormat): string {
  return localizeNumbers(String(Math.round(Math.max(0, Math.min(100, percent)))), numberFormat);
}

// Step up units so the integer part stays at or below 3 digits. Decimals only below 100.
export function formatRateParts(bytesPerSec: number, numberFormat: NumberFormat): { value: string; unit: string } {
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s'];
  let value = Math.max(0, bytesPerSec);
  let i = 0;
  while (value >= 1000 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  let formatted: string;
  if (i === 0) formatted = String(Math.round(value));
  else if (value < 10) formatted = value.toFixed(2);
  else if (value < 100) formatted = value.toFixed(1);
  else formatted = String(Math.round(value));
  return { value: localizeNumbers(formatted, numberFormat), unit: units[i] };
}

export function formatDataSize(kb: number, numberFormat: NumberFormat): string {
  if (kb >= 1024 * 1024) return localizeNumbers(`${(kb / (1024 * 1024)).toFixed(1)} GB`, numberFormat);
  if (kb >= 1024) return localizeNumbers(`${(kb / 1024).toFixed(1)} MB`, numberFormat);
  return localizeNumbers(`${Math.round(kb)} KB`, numberFormat);
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
