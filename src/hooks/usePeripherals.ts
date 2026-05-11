// Detected peripherals (mice, keyboards, headsets qOS talks to directly).
// Refetches on the multiplex `devices` topic; initial fetch on mount.
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchService } from '../api/service';
import { useTopicCallback } from './useMultiplexSocket';

export type PeripheralSource = 'service' | 'webhid';

export interface Peripheral {
  id: string;
  name: string;
  vendor: string;
  category: string;
  vendorId: string;
  productId: string;
  serial: string;
  firmwareVersion: string;
  isWireless: boolean;
  capabilities: string[];
  /** Which backend owns this peripheral — the qOS service, or the browser via WebHID. */
  source?: PeripheralSource;
  dpi?: DpiState;
  polling?: PollingState;
  battery?: BatteryState;
  sleep?: SleepState;
  toggles?: ToggleState[];
}

export interface DpiState {
  minDpi: number;
  maxDpi: number;
  step: number;
  stageCount: number;
  activeStage: number;
  stageDpi: number[];
  current: number;
}

export interface PollingState {
  supportedHz: number[];
  currentHz: number;
}

export interface BatteryState {
  percent: number;
  charging: boolean;
}

export interface SleepState {
  idleSeconds: number;
  lowBatteryPercent: number;
}

export interface ToggleState {
  key: string;
  label: string;
  enabled: boolean;
}

interface PeripheralsResponse {
  items: Peripheral[];
}

export function usePeripherals(enabled: boolean) {
  const [peripherals, setPeripherals] = useState<Peripheral[]>([]);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const data = await fetchService<PeripheralsResponse>('/peripherals');
    if (!mountedRef.current) return;
    if (data) setPeripherals(data.items ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) return;
    refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [enabled, refresh]);

  useTopicCallback('devices', enabled, () => {
    void refresh();
  });

  return { peripherals, loading, refresh };
}

export async function fetchPeripheralDetail(id: string): Promise<Peripheral | null> {
  return await fetchService<Peripheral>(`/peripherals/${encodeURIComponent(id)}`);
}
