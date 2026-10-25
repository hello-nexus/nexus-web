import { useMemo } from 'react';
import { useSensors } from './useSensors';
import { useTempSensorPrefs } from './useUiSettings';
import { resolveCpuTempSensor, resolveGpuTempSensor } from '../lib/tempSensorResolver';
import type { ComponentTemps } from '../lib/cooling/flow/heatModel';

/** Live CPU and GPU temperatures, C, from the sensor topic the Cooling and Monitoring pages read, with the sensors the user pinned; null while a sensor is missing. */
export function useComponentTemps(enabled: boolean): ComponentTemps {
  const sensors = useSensors(enabled);
  const prefs = useTempSensorPrefs();
  const cpu = resolveCpuTempSensor(sensors.cpu, prefs.cpuId)?.value;
  const gpu = resolveGpuTempSensor(sensors.gpu, prefs.gpuId)?.value;
  return useMemo(() => ({
    cpu: typeof cpu === 'number' && Number.isFinite(cpu) ? cpu : null,
    gpu: typeof gpu === 'number' && Number.isFinite(gpu) ? gpu : null,
  }), [cpu, gpu]);
}
