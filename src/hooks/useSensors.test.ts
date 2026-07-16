import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { isSmartStorageComponentId, useSensors } from './useSensors';
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

  it('excludes smart/*-keyed SMART components from storageSensors but keeps them in storageComponents', () => {
    h.storageData = {
      C: {
        id: 'C', name: 'Drive C', capacity: '1 TB', freeSpace: '500 GB', usedSpace: '500 GB', usedPercentage: '50',
        sensors: [{ id: 'storage/C/used', name: 'Drive C Used', type: 'Data', value: 500, units: 'GB', formatted: '500 GB', parent: { id: 'storage', name: 'Storage' } }],
      },
      'smart/nvme/0': {
        id: 'smart/nvme/0', name: 'Test NVMe', capacity: '', freeSpace: '', usedSpace: '', usedPercentage: '',
        sensors: [{ id: '/nvme/0/temperature/0', name: 'Composite Temperature', type: 'Temperature', value: 42, units: '°C', formatted: '42.0 °C', parent: { id: '/nvme/0', name: 'Test NVMe' } }],
      },
    };

    const { result } = renderHook(() => useSensors(true));
    expect(result.current.storageSensors.map(s => s.id)).toEqual(['storage/C/used']);
    // storageComponents is untouched - the smart/* component is still there
    // for consumers that key off it directly (sensorCategories.smartStorageSensors).
    expect(Object.keys(result.current.storageComponents)).toEqual(['C', 'smart/nvme/0']);
  });
});

describe('isSmartStorageComponentId', () => {
  it('matches only smart/-prefixed component ids', () => {
    expect(isSmartStorageComponentId('smart/nvme/0')).toBe(true);
    expect(isSmartStorageComponentId('smart/hdd/1')).toBe(true);
    expect(isSmartStorageComponentId('C')).toBe(false);
    expect(isSmartStorageComponentId('D')).toBe(false);
    expect(isSmartStorageComponentId('')).toBe(false);
  });
});
