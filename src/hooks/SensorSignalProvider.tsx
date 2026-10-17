import type { ReactNode } from 'react';
import { SensorSignalContext } from './SensorSignalContext';
import { useSensorSignal } from './useSensorSignal';

/** Subscribes to the sensors only while `enabled`, i.e. while a shown shader has sensor uniforms. */
export function SensorSignalProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const ref = useSensorSignal(enabled);
  return <SensorSignalContext.Provider value={ref}>{children}</SensorSignalContext.Provider>;
}
