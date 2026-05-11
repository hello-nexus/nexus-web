import { useTopic } from './useMultiplexSocket';

interface CurveCalculationsFrame {
  globalSpeedModifier: number;
  calculations: Array<{
    curveId: string;
    inputSensorId: string;
    inputTemperature: number;
    calculatedSpeed: number;
    actualSpeed: number;
    outputs: Array<{
      channelId: string;
      appliedSpeed: number;
    }>;
  }>;
}

export function useCoolingCurves(enabled: boolean): CurveCalculationsFrame | null {
  return useTopic<CurveCalculationsFrame>('cooling-curves', enabled);
}
