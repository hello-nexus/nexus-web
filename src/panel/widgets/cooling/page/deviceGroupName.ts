// Curated product-name fallbacks for hub fan groups whose channels carry no
// deviceName (pre-existing installs / older service builds). Keyed by the
// deviceId prefix; shared by the desktop cooling page and the immersive
// editor so both render the same group headers.
const PREFIX_NAMES: readonly [string, string][] = [
  ['np50:', 'HYTE NP50'],
  ['minihub:', 'iBUYPOWER MiniHub'],
  ['smarthub:', 'HYTE SmartHub'],
  ['lianli:', 'Lian Li Uni Hub SL-Infinity'],
  ['corsair:', 'Corsair iCUE LINK'],
];

export function fanDeviceGroupName(deviceId: string, deviceName?: string | null): string {
  if (deviceName) return deviceName;
  for (const [prefix, name] of PREFIX_NAMES) {
    if (deviceId.startsWith(prefix)) return name;
  }
  return deviceId;
}

// Rail block id for the board's own fan headers, the only channels on no device.
// Persisted as a fanGroups member, a collapsed-group key and a rename key, but it
// is not a device id: it must not reach a per-channel call.
export const MOTHERBOARD_BLOCK_ID = 'motherboard';

/** The rail block a channel belongs to: its device, or the board's own group. */
export function blockIdOf(ch: { deviceId?: string | null }): string {
  return ch.deviceId || MOTHERBOARD_BLOCK_ID;
}
