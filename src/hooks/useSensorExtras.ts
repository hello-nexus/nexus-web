import { useMemo } from 'react';
import { useTopic } from './useMultiplexSocket';
import type { HardwareSensor } from './useSensors';

export interface ExtrasComponent {
  id: string;
  name: string;
  sensors: HardwareSensor[];
}

export interface SensorExtras {
  batteries: ExtrasComponent[];
  nics: ExtrasComponent[];
  coolers: ExtrasComponent[];
  psus: ExtrasComponent[];
  nvmeStorage: ExtrasComponent[];
  embeddedControllers: ExtrasComponent[];
}

const EMPTY: SensorExtras = {
  batteries: [], nics: [], coolers: [], psus: [], nvmeStorage: [], embeddedControllers: [],
};

/**
 * Subscribes to the "extras" topic only while the Monitoring Detailed tab is
 * mounted. Other pages never see this data - the service's broadcaster gates
 * emission on the subscription state, so unsubscribing here also stops the
 * server from gathering battery/PSU/NIC sensors.
 */
export function useSensorExtras(enabled: boolean): SensorExtras {
  const frame = useTopic<SensorExtras>('extras', enabled);
  return useMemo<SensorExtras>(() => {
    if (!enabled || !frame) return EMPTY;
    return {
      batteries: frame.batteries ?? [],
      nics: frame.nics ?? [],
      coolers: frame.coolers ?? [],
      psus: frame.psus ?? [],
      nvmeStorage: frame.nvmeStorage ?? [],
      embeddedControllers: frame.embeddedControllers ?? [],
    };
  }, [enabled, frame]);
}
