import { convertTemperature, formatNumber, localizeNumbers, tempUnitSymbol, type NumberFormat, type TempUnit } from '../../../../lib/units';

export const FAN_MIN_DOMAIN_MAX = 1200;
export const FAN_DOMAIN_STEP = 500;

export function fanDomainMax(values: readonly number[], current: number): number {
  const finiteValues = values.filter(Number.isFinite);
  const observed = Math.max(FAN_MIN_DOMAIN_MAX, current, ...finiteValues);
  return Math.ceil(observed / FAN_DOMAIN_STEP) * FAN_DOMAIN_STEP;
}

export function averageFanRpm(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function formatAverageTemp(value: number | undefined, tempUnit: TempUnit, numberFormat: NumberFormat): string {
  if (value === undefined) return '--';
  return localizeNumbers(`${Math.round(convertTemperature(value, tempUnit))}${tempUnitSymbol(tempUnit)}`, numberFormat);
}

export function formatFanRpm(value: number, hasFans: boolean, numberFormat: NumberFormat): string {
  if (!hasFans) return '--';
  return `${formatNumber(Math.round(value), numberFormat)} RPM`;
}
