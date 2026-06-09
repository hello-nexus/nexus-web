// Flatten a monitoring frame into the flat `family.host.sensor` readings that
// SDK widget workers subscribe to via nexus.sensors.

import type { MonitoringFrame } from '../hooks/useMonitoringFrame';

export interface FlatReading {
  id: string;
  name: string;
  type: string;
  units: string;
  value: number;
  formatted: string;
  parentId: string;
  parentName: string;
  timestamp: number;
}

export function normaliseId(family: string, raw: string): string {
  const cleaned = raw.toLowerCase()
    .replace(/^[/.]+/, '')
    .replace(/[/\\:\s]+/g, '.')
    .replace(/[^a-z0-9.\-_]+/g, '-')
    .replace(/\.+/g, '.');
  if (cleaned.length === 0) return family;
  if (cleaned.startsWith(family + '.') || cleaned === family) return cleaned;
  return `${family}.${cleaned}`;
}

export function flattenFrameForWorker(frame: MonitoringFrame): FlatReading[] {
  const out: FlatReading[] = [];
  const now = Date.now();
  const push = (
    family: string,
    c: { id?: string; name?: string; sensors?: Array<{ id: string; name?: string; type?: string; units?: string; value?: number; formatted?: string }> } | null | undefined,
  ) => {
    if (!c) return;
    const parentId = normaliseId(family, c.id ?? family);
    for (const s of c.sensors ?? []) {
      out.push({
        id: normaliseId(family, s.id),
        name: s.name ?? '',
        type: s.type ?? '',
        units: s.units ?? '',
        value: typeof s.value === 'number' ? s.value : 0,
        formatted: s.formatted ?? String(s.value ?? ''),
        parentId,
        parentName: c.name ?? '',
        timestamp: now,
      });
    }
  };
  push('cpu', frame.cpu);
  if (frame.gpu) for (const g of frame.gpu) push('gpu', g);
  push('memory', frame.memory);
  push('motherboard', frame.motherboard);
  if (frame.storage) for (const drive of Object.values(frame.storage)) push('storage', drive);
  return out;
}
