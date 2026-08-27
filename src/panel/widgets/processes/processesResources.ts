// The four resources the immersive graph cards chart, and how each one reads
// its system-wide value, its per-process value, and its label.
//
// System values come off the composite `monitoring` frame the panel already
// subscribes to (PanelEntrypoint's monitoring bridge), so the cards add no
// socket topic of their own.

import type { MonitoringFrame } from '../../../types/monitoringFrame';
import type { ProcessRow } from './processesData';

export const RESOURCE_KEYS = ['cpu', 'gpu', 'memory', 'io'] as const;
export type ResourceKey = typeof RESOURCE_KEYS[number];

export const RESOURCE_LABEL_KEYS: Record<ResourceKey, string> = {
  cpu: 'panel.processes.col.cpu',
  gpu: 'panel.processes.col.gpu',
  memory: 'panel.processes.resource.memory',
  io: 'panel.processes.resource.io',
};

/** Shared-history key per resource, so a card re-mounting picks up the samples
 *  already collected rather than redrawing from empty. */
export const RESOURCE_HISTORY_KEYS: Record<ResourceKey, string> = {
  cpu: 'cpu::CPU Total',
  gpu: 'gpu::GPU Load',
  memory: 'memory::Memory Load',
  io: 'processes::Disk IO Bytes',
};

/** Percentages chart against a fixed axis; a byte rate has no ceiling to
 *  scale against, so its card auto-scales. */
export function resourceDomain(resource: ResourceKey): [number, number] | undefined {
  return resource === 'io' ? undefined : [0, 100];
}

function loadOf(sensors: { name: string; type: string; value: number }[] | undefined, match: (s: { name: string; type: string }) => boolean): number {
  return sensors?.find(match)?.value ?? 0;
}

/**
 * System-wide value for a resource. CPU/GPU/memory are percentages read the
 * same way the Monitoring page's tab chips read them (tabChipValue.ts); I/O is
 * the sum of the per-process rates, so the card's graph and its rows below
 * always describe the same quantity.
 */
export function systemValue(resource: ResourceKey, frame: MonitoringFrame | null, rows: readonly ProcessRow[]): number {
  switch (resource) {
    case 'cpu':
      return loadOf(frame?.cpu?.sensors, s => s.name === 'CPU Total');
    case 'gpu': {
      for (const gpu of frame?.gpu ?? []) {
        const value = loadOf(gpu.sensors, s => s.type === 'Load' && (s.name === 'GPU Core' || s.name.startsWith('D3D')));
        if (value > 0) return value;
      }
      return 0;
    }
    case 'memory': {
      const sensors = frame?.memory?.sensors;
      return sensors?.find(s => s.type === 'Load')?.value
        ?? loadOf(sensors, s => s.name === 'Memory Usage');
    }
    case 'io':
      return rows.reduce((sum, r) => sum + (r.io ?? 0), 0);
  }
}

/** A row's own figure for the resource, or undefined where the platform
 *  reports none (GPU off Windows, I/O against a service too old to send it). */
export function rowValue(resource: ResourceKey, row: ProcessRow): number | undefined {
  switch (resource) {
    case 'cpu': return row.cpu;
    case 'gpu': return row.gpu;
    case 'memory': return row.memMb;
    case 'io': return row.io;
  }
}

/** Rows that carry a figure for this resource, biggest first. */
export function topRowsFor(resource: ResourceKey, rows: readonly ProcessRow[], limit: number): ProcessRow[] {
  return rows
    .filter(r => rowValue(resource, r) !== undefined)
    .sort((a, b) => (rowValue(resource, b) ?? 0) - (rowValue(resource, a) ?? 0) || a.name.localeCompare(b.name))
    .slice(0, limit);
}
