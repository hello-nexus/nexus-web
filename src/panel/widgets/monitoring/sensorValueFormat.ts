import {
  isCelsiusUnit, convertTemperature, tempUnitSymbol, localizeNumbers,
  type TempUnit, type NumberFormat,
} from '../../../lib/units';

const DATA_UNIT_LADDER = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

/**
 * Auto-scales a byte-based data value along the B/KB/MB/GB/TB/PB ladder,
 * mirroring formatNetworkRate's B/s ladder (networkSensors.ts). Returns null
 * for any unit outside the ladder - temps, percent, volts, clocks, RPM, and
 * rate units like "MB/s" all fail the exact match - so callers fall back to
 * the sensor's own formatted string.
 */
export function formatScaledDataValue(value: number, units: string): string | null {
  if (!Number.isFinite(value)) return null;
  const unitIndex = DATA_UNIT_LADDER.indexOf(units.toUpperCase());
  if (unitIndex === -1) return null;

  let scaled = Math.max(0, value);
  let index = unitIndex;
  while (scaled >= 1024 && index < DATA_UNIT_LADDER.length - 1) {
    scaled /= 1024;
    index++;
  }
  while (scaled > 0 && scaled < 1 && index > 0) {
    scaled *= 1024;
    index--;
  }

  const decimals = Number.isInteger(scaled) ? 0 : 1;
  return `${scaled.toFixed(decimals)} ${DATA_UNIT_LADDER[index]}`;
}

/**
 * Format a sensor reading for display, honoring the monitoring temperature unit
 * and number format. Temperature sensors (the service always reports °C)
 * convert to the chosen unit; every other sensor keeps its service-formatted
 * string (auto-scaled for byte-data units). The number is always re-separated
 * to the chosen format. Display-only - the sensor's numeric `value` stays
 * Celsius so thresholds and gauge fills keep comparing against it.
 */
export function formatSensorValue(
  value: number, units: string, formatted: string, tempUnit: TempUnit, numberFormat: NumberFormat,
): string {
  if (tempUnit === 'f' && isCelsiusUnit(units)) {
    // Preserve the source string's decimal precision so a C->F toggle doesn't
    // silently drop the fractional degree the service reported.
    const decimals = formatted.match(/\.(\d+)/)?.[1].length ?? 0;
    return localizeNumbers(`${convertTemperature(value, 'f').toFixed(decimals)} ${tempUnitSymbol('f')}`, numberFormat);
  }
  return localizeNumbers(formatScaledDataValue(value, units) ?? formatted, numberFormat);
}
