import { createContext, useContext, useEffect } from 'react';

/**
 * Lets DevicePage hold its "Detecting device..." screen after the user turns
 * Nexus Control on, until the device page's own poll finds the device. A page
 * that never reports is revealed at once.
 */
export const DeviceDetectingContext = createContext<((waiting: boolean) => void) | null>(null);

export function useReportDeviceWaiting(waiting: boolean) {
  const report = useContext(DeviceDetectingContext);
  useEffect(() => { report?.(waiting); }, [report, waiting]);
}
