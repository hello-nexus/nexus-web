/** Prefix of the service's device id for a Lian Li wireless chain; the same id keys the chain's shared name. */
export const WIRELESS_DEVICE_PREFIX = 'lianli-wireless:';

export const wirelessDeviceId = (mac: string): string => `${WIRELESS_DEVICE_PREFIX}${mac}`;

/** The chain MAC behind a device id, or null when the id is not a wireless chain's. */
export const wirelessMacOf = (deviceId: string): string | null =>
  deviceId.startsWith(WIRELESS_DEVICE_PREFIX) ? deviceId.slice(WIRELESS_DEVICE_PREFIX.length) : null;
