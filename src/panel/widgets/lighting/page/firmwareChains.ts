// Wired and wireless Lian Li chains that can play a stored animation instead of the engine's frames.

export const WIRELESS_DEVICE_PREFIX = 'lianli-wireless:';
export const FLEX_DEVICE_PREFIX = 'lianli-flex:';

/** Lighting device ids of the chains not following the Lighting page. */
export function presetDeviceIds(prefix: string, chains: readonly { mac: string; mode: string }[]): string[] {
  return chains.filter(c => c.mode !== 'custom').map(c => `${prefix}${c.mac}`);
}

/** Which family a firmware-owned lighting device id belongs to, with its unit MAC. */
export function presetTarget(deviceId: string): { family: 'wireless' | 'flex'; mac: string } | null {
  if (deviceId.startsWith(WIRELESS_DEVICE_PREFIX)) return { family: 'wireless', mac: deviceId.slice(WIRELESS_DEVICE_PREFIX.length) };
  if (deviceId.startsWith(FLEX_DEVICE_PREFIX)) return { family: 'flex', mac: deviceId.slice(FLEX_DEVICE_PREFIX.length) };
  return null;
}
