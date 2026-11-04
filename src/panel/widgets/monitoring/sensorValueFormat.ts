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
 * Fixed-decimal text with the service's exact semantics: toFixed on the absolute
 * value (exact binary value, ties away from zero), sign restored afterwards, and
 * never "-0".
 */
export function toFixedAway(value: number, decimals: number): string {
  const text = Math.abs(value).toFixed(decimals);
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

type DecimalRule = { decimals: number; wholeWhenHidden: boolean };

// The one per-type rule. Default decimals match the service's own strings;
// wholeWhenHidden types round to an integer when the whole-numbers setting is
// on, the rest (voltage, current, frame time) always keep their precision.
// Keyed by sensor type: the service strings for flow, noise, frequency and FPS
// carry no unit, so the unit string alone cannot tell them.
function decimalRuleFor(type: string): DecimalRule | null {
  switch (type) {
    case 'Temperature': case 'Power': case 'Load': case 'Control': case 'Level':
    case 'Flow': case 'Noise': case 'Frequency':
      return { decimals: 1, wholeWhenHidden: true };
    case 'Voltage': case 'Current': return { decimals: 3, wholeWhenHidden: false };
    case 'FrameTime': return { decimals: 1, wholeWhenHidden: false };
    case 'Clock': case 'Fan': case 'Framerate': return { decimals: 0, wholeWhenHidden: false };
    default: return null;
  }
}

/** Decimals the shared rule gives a sensor type, or null for an ungoverned type. */
export function decimalsForType(type: string, wholeNumbers: boolean): number | null {
  const rule = decimalRuleFor(type);
  if (!rule) return null;
  return rule.wholeWhenHidden && wholeNumbers ? 0 : rule.decimals;
}

const FIRST_NUMBER_RE = /-?\d+(?:\.\d+)?/;

/**
 * Format a sensor reading for display, honoring the monitoring temperature unit,
 * number format and the whole-numbers setting. Temperature sensors (the service
 * always reports °C) convert to the chosen unit. Typed sensors keep the
 * service's own string and only its number is replaced by the re-rounded raw
 * value, so the unit and spacing stay the provider's; a string with no number
 * (an idle FPS provider reports "-") is returned unchanged. Byte-data units
 * auto-scale, and a call without a type passes the service string through.
 * The number is always re-separated to the chosen format. Display-only - the
 * sensor's numeric `value` stays Celsius so thresholds and gauge fills keep
 * comparing against it.
 */
export function formatSensorValue(
  value: number, units: string, formatted: string, tempUnit: TempUnit, numberFormat: NumberFormat,
  type = '', wholeNumbers = false,
): string {
  const celsius = isCelsiusUnit(units);
  const rule = type && Number.isFinite(value) ? decimalRuleFor(type) : null;
  if (!rule) {
    if (tempUnit === 'f' && celsius) {
      // Preserve the source string's decimal precision so a C->F toggle doesn't
      // silently drop the fractional degree the service reported.
      const decimals = formatted.match(/\.(\d+)/)?.[1].length ?? 0;
      return localizeNumbers(`${convertTemperature(value, 'f').toFixed(decimals)} ${tempUnitSymbol('f')}`, numberFormat);
    }
    return localizeNumbers(formatScaledDataValue(value, units) ?? formatted, numberFormat);
  }
  const scaled = formatScaledDataValue(value, units);
  if (scaled !== null) return localizeNumbers(scaled, numberFormat);
  if (!FIRST_NUMBER_RE.test(formatted)) return formatted;
  const decimals = decimalsForType(type, wholeNumbers) ?? rule.decimals;
  if (celsius && tempUnit === 'f') {
    return localizeNumbers(`${toFixedAway(convertTemperature(value, 'f'), decimals)} ${tempUnitSymbol('f')}`, numberFormat);
  }
  return localizeNumbers(formatted.replace(FIRST_NUMBER_RE, toFixedAway(value, decimals)), numberFormat);
}
