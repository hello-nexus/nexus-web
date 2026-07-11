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
  memoryModules: ExtrasComponent[];
}

// Exported so callers that thread an optional SensorExtras through a pure
// helper (e.g. MonitoringWidget.resolveSensor) have a stable default instead
// of each re-declaring the same empty-array literal.
export const EMPTY_SENSOR_EXTRAS: SensorExtras = {
  batteries: [], nics: [], coolers: [], psus: [], nvmeStorage: [], embeddedControllers: [], memoryModules: [],
};
const EMPTY = EMPTY_SENSOR_EXTRAS;

/**
 * Subscribes to the "extras" topic only while `enabled` is true - the
 * Monitoring Detailed tab (always) and the monitoring widget/settings panel
 * (only while a slot is configured to an extras-backed device). The
 * service's broadcaster gates emission on the subscription state, so an
 * unsubscribed caller also stops the server from gathering battery/PSU/NIC/
 * DIMM sensors.
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
      memoryModules: frame.memoryModules ?? [],
    };
  }, [enabled, frame]);
}
