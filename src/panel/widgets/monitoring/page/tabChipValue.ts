import type { HardwareSensor } from '../../../../hooks/useSensors';
import { localizeNumbers, type NumberFormat } from '../../../../lib/units';
import { formatRate } from './shared';
import type { HistoryMetric } from './metricHistoryHelpers';

// Fixed pill widths for the tab-bar live value chips - comfortably wider than
// the worst-case rendered string ("100%"; formatRate's own boundary rounding
// can also print a 4-digit-plus-decimal rate like "1024.0 KB/s") so a
// digit-count change (9% -> 100%) never shifts the tab bar.
export const TAB_CHIP_PERCENT_MIN_WIDTH = '3.5rem';
export const TAB_CHIP_RATE_MIN_WIDTH = '6rem';

/**
 * Live load percent backing the CPU/GPU/Memory tab chips. CPU Total and
 * Memory Usage are already 0-100 Load sensors reported by the service; GPU
 * matches the same Core/D3D Load sensor the GPU-tab-visibility check uses,
 * scoped to whichever adapter `gpu` already resolves to (useSensors follows
 * the preferred-GPU setting internally).
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
    case 'memory': return memory.find(s => s.name === 'Memory Usage')?.value ?? 0;
  }
}

/**
 * Formatted live value for a monitoring tab chip: rounded percent for
 * cpu/gpu/memory, formatRate's B/KB/MB-per-second scale for network.
 */
export function formatTabChipValue(
  tab: HistoryMetric,
  cpu: readonly HardwareSensor[],
  gpu: readonly HardwareSensor[],
  memory: readonly HardwareSensor[],
  networkBytesPerSec: number,
  numberFormat: NumberFormat,
): string {
  if (tab === 'network') return formatRate(networkBytesPerSec, numberFormat);
  return localizeNumbers(`${Math.round(tabChipLoadPercent(tab, cpu, gpu, memory))}%`, numberFormat);
}
