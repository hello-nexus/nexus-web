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
