import type { HardwareSensor } from '../../../../hooks/useSensors';
import { localizeNumbers, type NumberFormat } from '../../../../lib/units';
import { formatRate } from './shared';
import type { HistoryMetric } from './metricHistoryHelpers';

// Fixed pill widths for the tab-bar live value chips - sized to the realistic
// worst case rather than the absolute one (100% is vanishingly rare; a
// transient "1024.0 KB/s" boundary tick is a single frame), so a digit-count
// change within that realistic range (9% -> 99%, "42 B/s" -> "999.9 MB/s")
// never shifts the tab bar. Paired with Badge's `compact` prop, which trims
// the horizontal padding so the value reaches close to the pill's edges at
// this tighter width.
export const TAB_CHIP_PERCENT_MIN_WIDTH = '2.5rem';
export const TAB_CHIP_RATE_MIN_WIDTH = '4.75rem';

/**
 * Live load percent backing the CPU/GPU/Memory tab chips. CPU Total is
 * already a 0-100 Load sensor reported by the service; GPU matches the same
 * Core/D3D Load sensor the GPU-tab-visibility check uses, scoped to whichever
 * adapter `gpu` already resolves to (useSensors follows the preferred-GPU
 * setting internally). Memory matches by Load type first - the Mac/Linux
 * providers synthesize their own "Memory Usage" Load sensor, but Windows'
 * LibreHardwareMonitor surfaces its native RAM hardware's own Load sensor
 * (named "Memory") as-is, so a name-only match misses it and the chip
 * silently reads 0 on Windows; the "Memory Usage" name check stays as a
 * fallback for a Load-typed match that never lands.
 */
export function tabChipLoadPercent(
  tab: 'cpu' | 'gpu' | 'memory',
  cpu: readonly HardwareSensor[],
  gpu: readonly HardwareSensor[],
  memory: readonly HardwareSensor[],
): number {
  switch (tab) {
    case 'cpu': return cpu.find(s => s.name === 'CPU Total')?.value ?? 0;
    case 'gpu': return gpu.find(s => s.type === 'Load' && (s.name === 'GPU Core' || s.name.startsWith('D3D')))?.value ?? 0;
    case 'memory': return memory.find(s => s.type === 'Load')?.value ?? memory.find(s => s.name === 'Memory Usage')?.value ?? 0;
  }
}

/**
 * Formatted live value for a monitoring tab chip: rounded percent for
 * cpu/gpu/memory, formatRate's B/KB/MB-per-second scale for network/storage.
 */
export function formatTabChipValue(
  tab: HistoryMetric,
  cpu: readonly HardwareSensor[],
  gpu: readonly HardwareSensor[],
  memory: readonly HardwareSensor[],
  networkBytesPerSec: number,
  storageBytesPerSec: number,
  numberFormat: NumberFormat,
): string {
  if (tab === 'network') return formatRate(networkBytesPerSec, numberFormat);
  if (tab === 'storage') return formatRate(storageBytesPerSec, numberFormat);
  return localizeNumbers(`${Math.round(tabChipLoadPercent(tab, cpu, gpu, memory))}%`, numberFormat);
}
