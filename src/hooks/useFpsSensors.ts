import { useMemo } from 'react';
import { useTopic } from './useMultiplexSocket';
import type { HardwareSensor } from './useSensors';

interface HardwareComponent {
  id: string;
  name: string;
  sensors: HardwareSensor[];
}

/**
 * Subscribes to FPS only when an FPS widget slot is active. The backend starts
 * ETW capture from this topic subscription, so callers must keep `enabled`
 * tied to visible widget use.
 */
export function useFpsSensors(enabled: boolean): HardwareSensor[] {
  const component = useTopic<HardwareComponent>('fps', enabled);

  return useMemo(() => {
    if (!enabled) return [];
    return component?.sensors ?? [];
  }, [enabled, component]);
}
