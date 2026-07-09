// Memory series, sensors, and per-process figures across the monitoring page
// arrive in MiB. Render MB below 1 GiB and step up to GB above it so large
// values stay readable. The 1024 MiB crossover matches the StackedChart Y-axis
// (formatYLabel), keeping a chart and its labels in the same unit.

import { localizeNumbers, type NumberFormat } from './units';

const GIB_IN_MIB = 1024;

/** Single value in MiB → "512 MB" / "4.0 GB" (GB to one decimal). */
export function formatMemoryMb(mb: number, numberFormat: NumberFormat): string {
  if (mb >= GIB_IN_MIB) return localizeNumbers(`${(mb / GIB_IN_MIB).toFixed(1)} GB`, numberFormat);
  return localizeNumbers(`${Math.round(mb)} MB`, numberFormat);
}

/**
 * "used / total" headline parts sharing one unit picked from the total, so the
 * pair never mixes MB and GB. The unit is chosen from `totalMb` and applied to
 * both numbers at the same precision.
 */
export function formatMemoryPair(usedMb: number, totalMb: number, numberFormat: NumberFormat): { used: string; total: string; unit: string } {
  const gb = totalMb >= GIB_IN_MIB;
  const fmt = (mb: number) => localizeNumbers(gb ? (mb / GIB_IN_MIB).toFixed(1) : String(Math.round(mb)), numberFormat);
  return { used: fmt(usedMb), total: fmt(totalMb), unit: gb ? 'GB' : 'MB' };
}
