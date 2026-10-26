import { describe, expect, it } from 'vitest';
import type { HardwareSensor } from '../../../../hooks/useSensors';
import { filterDetailedEntries, type DetailedEntry } from './detailedSearch';

const sensor = (id: string, name: string, type: string, parent = 'Device'): HardwareSensor => ({
  id, name, type, value: 1, units: '', formatted: '1', parent: { id: 'p', name: parent },
});

const entries: DetailedEntry[] = [
  {
    id: 'cpu',
    title: 'CPU',
    subtitle: 'Ryzen 9 7950X',
    sensors: [
      sensor('a', 'Core #1', 'Temperature'),
      sensor('b', 'Core #1', 'Load'),
      sensor('c', 'Package', 'Power'),
    ],
  },
  { id: 'gpu', title: 'GPU', subtitle: 'RTX 4090', sensors: [sensor('d', 'Hot Spot', 'Temperature')] },
];
const label = (type: string) => (type === 'Temperature' ? 'Temperatures' : type);
const ids = (list: DetailedEntry[]) => list.flatMap(e => e.sensors.map(s => s.id));

describe('filterDetailedEntries', () => {
  it('returns every entry for an empty or blank query', () => {
    expect(filterDetailedEntries(entries, '', label)).toBe(entries);
    expect(filterDetailedEntries(entries, '   ', label)).toBe(entries);
  });

  it('matches a sensor name and drops sections with no match', () => {
    const out = filterDetailedEntries(entries, 'package', label);
    expect(out.map(e => e.id)).toEqual(['cpu']);
    expect(ids(out)).toEqual(['c']);
  });

  it('treats a space as separate words that must each match', () => {
    expect(ids(filterDetailedEntries(entries, 'core temp', label))).toEqual(['a']);
    expect(ids(filterDetailedEntries(entries, 'temp core', label))).toEqual(['a']);
    expect(ids(filterDetailedEntries(entries, 'core pack', label))).toEqual([]);
  });

  it('keeps every sensor under a matching group header', () => {
    expect(ids(filterDetailedEntries(entries, 'temperatures', label))).toEqual(['a', 'd']);
  });

  it('keeps every sensor under a matching section title or model', () => {
    expect(ids(filterDetailedEntries(entries, 'ryzen', label))).toEqual(['a', 'b', 'c']);
    expect(ids(filterDetailedEntries(entries, 'gpu', label))).toEqual(['d']);
  });

  it('combines a section and a sensor word', () => {
    expect(ids(filterDetailedEntries(entries, 'gpu hot', label))).toEqual(['d']);
  });

  it('is empty when nothing matches', () => {
    expect(filterDetailedEntries(entries, 'zzz', label)).toEqual([]);
  });
});
