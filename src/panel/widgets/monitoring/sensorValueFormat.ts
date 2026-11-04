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

/** Half away from zero; never yields negative zero. */
export function roundHalfAwayFromZero(value: number): number {
  const r = Math.sign(value) * Math.round(Math.abs(value));
  return r === 0 ? 0 : r;
}

type DecimalRule = { decimals: number; wholeWhenHidden: boolean; suffix: string };

// The one per-type rule. Default decimals match the service's own strings;
// wholeWhenHidden types round to an integer when the whole-numbers setting is
// on, the rest (voltage, current, frame time) always keep their precision.
// Classified by sensor type first: the service strings for flow, noise,
// frequency and FPS carry no unit, so the unit string alone cannot tell them.
function decimalRuleFor(type: string, units: string): DecimalRule | null {
  if (units === 'ms') return { decimals: 1, wholeWhenHidden: false, suffix: ' ms' };
  switch (type) {
    case 'Temperature': return { decimals: 1, wholeWhenHidden: true, suffix: '' };
    case 'Power': return { decimals: 1, wholeWhenHidden: true, suffix: ' W' };
    case 'Load': case 'Control': case 'Level': return { decimals: 1, wholeWhenHidden: true, suffix: '%' };
    case 'Flow': case 'Noise': case 'Frequency': return { decimals: 1, wholeWhenHidden: true, suffix: '' };
    case 'Voltage': return { decimals: 3, wholeWhenHidden: false, suffix: ' V' };
    case 'Current': return { decimals: 3, wholeWhenHidden: false, suffix: ' A' };
    case 'Clock': return { decimals: 0, wholeWhenHidden: false, suffix: ' MHz' };
    case 'Fan': return { decimals: 0, wholeWhenHidden: false, suffix: ' RPM' };
    case 'Framerate': return { decimals: 0, wholeWhenHidden: false, suffix: '' };
    default: break;
  }
  // Metadata-less callers (type unknown): fall back to the unit string.
  if (isCelsiusUnit(units)) return { decimals: 1, wholeWhenHidden: true, suffix: '' };
  if (units === 'W') return { decimals: 1, wholeWhenHidden: true, suffix: ' W' };
  if (units === '%') return { decimals: 1, wholeWhenHidden: true, suffix: '%' };
  if (units === 'V') return { decimals: 3, wholeWhenHidden: false, suffix: ' V' };
  if (units === 'A') return { decimals: 3, wholeWhenHidden: false, suffix: ' A' };
  return null;
}

/**
 * Format a sensor reading for display, honoring the monitoring temperature unit,
 * number format and the whole-numbers setting. Temperature sensors (the service
 * always reports °C) convert to the chosen unit. Typed sensors are rebuilt from
 * the raw value by the per-type rule; byte-data units auto-scale and anything
 * unclassified (energy, time spans, throughput) keeps the service string. The
 * number is always re-separated to the chosen format. Display-only - the
 * sensor's numeric `value` stays Celsius so thresholds and gauge fills keep
 * comparing against it.
 */
export function formatSensorValue(
  value: number, units: string, formatted: string, tempUnit: TempUnit, numberFormat: NumberFormat,
  type = '', wholeNumbers = false,
): string {
  const scaled = formatScaledDataValue(value, units);
  if (scaled !== null) return localizeNumbers(scaled, numberFormat);
  const rule = Number.isFinite(value) ? decimalRuleFor(type, units) : null;
  if (!rule) return localizeNumbers(formatted, numberFormat);
  const isTemp = rule.wholeWhenHidden && (type === 'Temperature' || (type === '' && isCelsiusUnit(units)));
  const shown = isTemp ? convertTemperature(value, tempUnit) : value;
  const text = rule.wholeWhenHidden && wholeNumbers
    ? String(roundHalfAwayFromZero(shown))
    : shown.toFixed(rule.decimals);
  return localizeNumbers(`${text}${isTemp ? ` ${tempUnitSymbol(tempUnit)}` : rule.suffix}`, numberFormat);
}
