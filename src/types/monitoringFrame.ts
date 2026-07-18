import type { HardwareSensor, StorageComponent } from '../hooks/useSensors';

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
  /** Process creation time, UTC epoch ms; undefined when unavailable. */
  startedAtMs?: number;
  /** True for a foreground/windowed app, false for a background process;
   *  undefined on a service that doesn't report it yet. */
  isApp?: boolean;
  /** Resolved lazily server-side - null once resolution completes with no
   *  signer found, undefined while still unresolved (or unreported). */
  publisher?: string | null;
  signed?: 'signed' | 'unsigned' | 'unknown';
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
