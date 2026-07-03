import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSensors } from './useSensors';
import type { StorageComponent } from './useSensors';

const h = vi.hoisted(() => ({
  storageData: null as Record<string, StorageComponent> | null,
}));

vi.mock('./useMultiplexSocket', () => ({
  useTopic: (topic: string) => (topic === 'storage' ? h.storageData : null),
}));

describe('useSensors - storageSensors', () => {
  it('flattens storageComponents sensors in drive order', () => {
    h.storageData = {
      C: {
        id: 'C', name: 'Drive C', capacity: '1 TB', freeSpace: '500 GB', usedSpace: '500 GB', usedPercentage: '50',
        sensors: [{ id: 'storage/C/used', name: 'Drive C Used', type: 'Data', value: 500, units: 'GB', formatted: '500 GB', parent: { id: 'storage', name: 'Storage' } }],
      },
      D: {
        id: 'D', name: 'Drive D', capacity: '2 TB', freeSpace: '1 TB', usedSpace: '1 TB', usedPercentage: '50',
        sensors: [{ id: 'storage/D/used', name: 'Drive D Used', type: 'Data', value: 1000, units: 'GB', formatted: '1000 GB', parent: { id: 'storage', name: 'Storage' } }],
      },
    };

    const { result } = renderHook(() => useSensors(true));
    expect(result.current.storageSensors.map(s => s.id)).toEqual(['storage/C/used', 'storage/D/used']);
    // storageComponents is untouched - callers keying off it directly still work.
    expect(Object.keys(result.current.storageComponents)).toEqual(['C', 'D']);
  });

  it('returns an empty array when a drive reports no sensors', () => {
    h.storageData = {
      C: { id: 'C', name: 'Drive C', capacity: '1 TB', freeSpace: '500 GB', usedSpace: '500 GB', usedPercentage: '50' },
    };

    const { result } = renderHook(() => useSensors(true));
    expect(result.current.storageSensors).toEqual([]);
  });

  it('returns an empty array when no storage frame has arrived yet', () => {
    h.storageData = null;
    const { result } = renderHook(() => useSensors(true));
    expect(result.current.storageSensors).toEqual([]);
  });
});
