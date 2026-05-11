import type { HardwareSensor } from '../../../hooks/useSensors';

export const FAN_MIN_DOMAIN_MAX = 1200;
export const FAN_DOMAIN_STEP = 500;
export const TEMP_DOMAIN: [number, number] = [0, 100];

export function fanDomainMax(values: number[], current: number): number {
  const finiteValues = values.filter(Number.isFinite);
  const observed = Math.max(FAN_MIN_DOMAIN_MAX, current, ...finiteValues);
  return Math.ceil(observed / FAN_DOMAIN_STEP) * FAN_DOMAIN_STEP;
}

export function averageFanRpm(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function averageTemp(...sensors: Array<HardwareSensor | undefined>): number | undefined {
  const values = sensors
    .map(sensor => sensor?.value)
    .filter((value): value is number => value !== undefined && Number.isFinite(value));
  if (values.length === 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function formatAverageTemp(value: number | undefined): string {
  if (value === undefined) return '--';
  return `${Math.round(value)}°C`;
}

export function formatFanRpm(value: number, hasFans: boolean): string {
  if (!hasFans) return '--';
  return `${Math.round(value).toLocaleString()} RPM`;
}

export function paddedSamples(values: number[], fallback: number, sampleCount: number): number[] {
  const tail = values.filter(Number.isFinite).slice(-sampleCount);
  if (tail.length >= sampleCount) return tail;
  const fill = tail[0] ?? fallback;
  return [...new Array(sampleCount - tail.length).fill(fill), ...tail];
}

export function clampSamples(values: number[], [min, max]: [number, number]): number[] {
  return values.map(value => Math.min(max, Math.max(min, value)));
}
