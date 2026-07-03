import { useMemo } from 'react';
import { useTopic } from './useMultiplexSocket';
import { resolvePrimaryGpu, type GpuComponent } from '../lib/gpuResolver';
import { usePreferredGpuId } from './useUiSettings';

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
  // GPU only: vendor + integrated/discrete classification from the service.
  vendor?: string;
  integrated?: boolean;
  sensors: HardwareSensor[];
}

export interface SensorState {
  cpu: HardwareSensor[];
  /** Sensors of the resolved primary GPU (see `gpuComponents` for all GPUs). */
  gpu: HardwareSensor[];
  /** Model name of the resolved primary GPU (follows the picker; "" if none). */
  gpuModel: string;
  /** Every GPU the service reports, classified - drives the GPU picker. */
  gpuComponents: GpuComponent[];
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
  cpu: [], gpu: [], gpuModel: '', gpuComponents: [], memory: [], storage: [], storageComponents: {},
  storageSensors: [], motherboard: [],
  motherboardModel: '', cpuModel: '', gpuModels: [], memoryTotal: '',
};

/**
 * Subscribes to individual sensor topics via the multiplexed WebSocket.
 * Zero HTTP requests for sensor data - the service controls the push
 * cadence via MonitoringBroadcaster.
 */
export function useSensors(enabled: boolean): SensorState {
  const preferredGpuId = usePreferredGpuId();
  const cpuComponent = useTopic<HardwareComponent>('cpu', enabled);
  const gpuComponents = useTopic<HardwareComponent[]>('gpu', enabled);
  const memComponent = useTopic<HardwareComponent>('memory', enabled);
  const storageData = useTopic<Record<string, StorageComponent>>('storage', enabled);
  const moboComponent = useTopic<HardwareComponent>('motherboard', enabled);

  return useMemo<SensorState>(() => {
    if (!enabled) return EMPTY;

    const gpus = gpuComponents ?? [];
    const primaryGpu = resolvePrimaryGpu(gpus, preferredGpuId);
    const drives = storageData ?? {};
    return {
      cpu: cpuComponent?.sensors ?? [],
      gpu: primaryGpu?.sensors ?? [],
      gpuModel: primaryGpu?.name ?? '',
      gpuComponents: gpus,
      memory: memComponent?.sensors ?? [],
      storage: [],
      storageComponents: drives,
      storageSensors: Object.values(drives).flatMap(drive => drive.sensors ?? []),
      motherboard: moboComponent?.sensors ?? [],
      motherboardModel: moboComponent?.name ?? '',
      cpuModel: cpuComponent?.name ?? '',
      gpuModels: gpus.map(g => g.name),
      memoryTotal: '',
    };
  }, [enabled, preferredGpuId, cpuComponent, gpuComponents, memComponent, storageData, moboComponent]);
}
