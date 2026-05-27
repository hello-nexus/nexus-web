import { useMemo } from 'react';
import { useTopic } from './useMultiplexSocket';

export interface HardwareSensor {
  id: string;
  name: string;
  type: string;
  value: number;
  units: string;
  formatted: string;
  /** Capacity ceiling in the same units as `value` (e.g. installed RAM in GB
   *  on a `Memory Used` sensor). 0 / absent = no objective max, scale auto. */
  theoreticalMaximum?: number;
  parent: { id: string; name: string };
}

export interface StorageInfo {
  name: string;
  partition: string;
  capacity: string;
}

export interface StorageComponent {
  id: string;
  name: string;
  capacity: string;
  freeSpace: string;
  usedSpace: string;
  usedPercentage: string;
  sensors?: HardwareSensor[];
}

interface HardwareComponent {
  id: string;
  name: string;
  sensors: HardwareSensor[];
}

export interface SensorState {
  cpu: HardwareSensor[];
  gpu: HardwareSensor[];
  memory: HardwareSensor[];
  storage: StorageInfo[];
  storageComponents: Record<string, StorageComponent>;
  storageSensors: HardwareSensor[];
  motherboard: HardwareSensor[];
  motherboardModel: string;
  cpuModel: string;
  gpuModels: string[];
  memoryTotal: string;
}

const EMPTY: SensorState = {
  cpu: [], gpu: [], memory: [], storage: [], storageComponents: {},
  storageSensors: [], motherboard: [],
  motherboardModel: '', cpuModel: '', gpuModels: [], memoryTotal: '',
};

/**
 * Subscribes to individual sensor topics via the multiplexed WebSocket.
 * Zero HTTP requests for sensor data - the service controls the push
 * cadence via MonitoringBroadcaster.
 */
export function useSensors(enabled: boolean): SensorState {
  const cpuComponent = useTopic<HardwareComponent>('cpu', enabled);
  const gpuComponents = useTopic<HardwareComponent[]>('gpu', enabled);
  const memComponent = useTopic<HardwareComponent>('memory', enabled);
  const storageData = useTopic<Record<string, StorageComponent>>('storage', enabled);
  const moboComponent = useTopic<HardwareComponent>('motherboard', enabled);

  return useMemo<SensorState>(() => {
    if (!enabled) return EMPTY;

    return {
      cpu: cpuComponent?.sensors ?? [],
      gpu: gpuComponents?.[0]?.sensors ?? [],
      memory: memComponent?.sensors ?? [],
      storage: [],
      storageComponents: storageData ?? {},
      storageSensors: [],
      motherboard: moboComponent?.sensors ?? [],
      motherboardModel: moboComponent?.name ?? '',
      cpuModel: cpuComponent?.name ?? '',
      gpuModels: gpuComponents?.map(g => g.name) ?? [],
      memoryTotal: '',
    };
  }, [enabled, cpuComponent, gpuComponents, memComponent, storageData, moboComponent]);
}
