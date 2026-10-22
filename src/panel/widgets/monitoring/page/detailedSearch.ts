import type { HardwareSensor } from '../../../../hooks/useSensors';
import { matchesAllWords } from '../../../../search/match';
import { groupByType } from './shared';

export interface DetailedEntry {
  id: string;
  title: string;
  subtitle?: string;
  sensors: HardwareSensor[];
}

/**
 * Narrows the Detailed sections to the sensors a search query matches. A
 * sensor matches on its own name, its device, its group header and its
 * section title and model, so a matching header keeps everything under it and
 * "cpu temp" finds the CPU temperatures. An empty query returns the entries
 * untouched; sections left without sensors are dropped.
 */
export function filterDetailedEntries(
  entries: DetailedEntry[],
  query: string,
  groupTypeLabel: (type: string) => string,
): DetailedEntry[] {
  if (query.trim().length === 0) return entries;
  const out: DetailedEntry[] = [];
  for (const entry of entries) {
    const kept: HardwareSensor[] = [];
    for (const group of groupByType(entry.sensors)) {
      const label = groupTypeLabel(group.type);
      for (const s of group.sensors) {
        if (matchesAllWords(query, [s.name, s.parent?.name, label, group.type, entry.title, entry.subtitle])) kept.push(s);
      }
    }
    if (kept.length > 0) out.push({ ...entry, sensors: kept });
  }
  return out;
}
