import { useTopic } from './useMultiplexSocket';

interface CoolingRealtimeFrame {
  coolingComponents: Array<{
    id: string;
    name: string;
    type: string;
    devices: Array<{
      id: string;
      name: string;
      type: string;
      speed: number | null;
      rpm: number | null;
      pwm: number | null;
    }>;
  }>;
}

export function useCoolingRealtime(enabled: boolean): CoolingRealtimeFrame | null {
  return useTopic<CoolingRealtimeFrame>('cooling-realtime', enabled);
}
