import { useEffect, useState } from 'react';
import * as store from '../lib/monitoringStore';
import type { HardwareSensor, StorageComponent } from './useSensors';

export interface HardwareComponent {
  id: string;
  name: string;
  // GPU only: vendor + integrated/discrete classification from the service.
  vendor?: string;
  integrated?: boolean;
  sensors: HardwareSensor[];
}

export interface MonitoringProcessEntry {
  name: string;
  cpuPercent: number;
  memoryMb: number;
}

export interface MonitoringProcesses {
  processes: MonitoringProcessEntry[];
  totalCpu: number;
  totalMemoryPercent: number;
}

export interface MonitoringNetwork {
  entries: Array<{
    name: string;
    rateIn: number;
    rateOut: number;
  }>;
}

export interface MonitoringFrame {
  cpu: HardwareComponent | null;
  gpu: HardwareComponent[] | null;
  memory: HardwareComponent | null;
  storage: Record<string, StorageComponent> | null;
  motherboard: HardwareComponent | null;
  cpuModel: string;
  gpuModels: string[];
  memoryTotal: string;
  motherboardModel: string;
  processes: MonitoringProcesses | null;
  network: MonitoringNetwork | null;
}

export function useMonitoringFrame(): MonitoringFrame | null {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump(v => v + 1);
    store.subscribe(fn);
    return () => store.unsubscribe(fn);
  }, []);
  return store.getMonitoringFrame();
}
