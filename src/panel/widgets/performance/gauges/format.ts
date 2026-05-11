// Split a sensor's formatted string ("62.5 %", "1800 RPM", "45.2 °C",
// "12.4 GB", "3.6 GHz", etc.) into a numeric value and its unit so each
// gauge can deemphasise the unit (smaller, dimmer text) while keeping
// the number bold and primary - mirrors the desktop monitoring overview.
export function splitFormatted(formatted: string): { value: string; unit: string } {
  const match = /^(-?\d+(?:\.\d+)?)(.*)$/.exec(formatted);
  if (match) return { value: match[1], unit: match[2].trim() };
  return { value: formatted, unit: '' };
}
