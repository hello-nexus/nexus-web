import { useMemo } from 'react';
import { useSensors, type HardwareSensor } from './useSensors';
import { useTempSensorPrefs } from './useUiSettings';
import { resolveCpuTempSensor, resolveGpuTempSensor } from '../lib/tempSensorResolver';
import type { ComponentTemps } from '../lib/cooling/flow/heatModel';

const finite = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** A part's package power sensor: the Power-type sensor named for the package, else its first Power sensor. */
function packagePower(sensors: readonly HardwareSensor[]): HardwareSensor | undefined {
  const power = sensors.filter(s => s.type === 'Power');
  return power.find(s => /package/i.test(s.name)) ?? power[0];
}

/** Live CPU and GPU temperatures, C, and package power, W, from the sensor topic the Cooling and Monitoring pages read, with the sensors the user pinned; null while a sensor is missing. */
export function useComponentTemps(enabled: boolean): ComponentTemps {
  const sensors = useSensors(enabled);
  const prefs = useTempSensorPrefs();
  const cpu = resolveCpuTempSensor(sensors.cpu, prefs.cpuId)?.value;
  const gpu = resolveGpuTempSensor(sensors.gpu, prefs.gpuId)?.value;
  const cpuW = packagePower(sensors.cpu)?.value;
  const gpuW = packagePower(sensors.gpu)?.value;
  return useMemo(() => ({
    cpu: finite(cpu),
    gpu: finite(gpu),
    cpuW: finite(cpuW),
    gpuW: finite(gpuW),
  }), [cpu, gpu, cpuW, gpuW]);
}
