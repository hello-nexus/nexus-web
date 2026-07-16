// Memory series, sensors, and per-process figures across the monitoring page
// arrive in MiB. Render MB below 1 GiB and step up to GB above it so large
// values stay readable.

import { localizeNumbers, type NumberFormat } from './units';

const GIB_IN_MIB = 1024;

/** Single value in MiB → "512 MB" / "4.0 GB" (GB to one decimal). */
export function formatMemoryMb(mb: number, numberFormat: NumberFormat): string {
  if (mb >= GIB_IN_MIB) return localizeNumbers(`${(mb / GIB_IN_MIB).toFixed(1)} GB`, numberFormat);
  return localizeNumbers(`${Math.round(mb)} MB`, numberFormat);
}
