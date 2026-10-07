// Scroll-and-shine targets for a device page's jump to the Lighting or Cooling
// page. Each builder names the element the destination page tags with
// data-search-anchor; a jump passes an ordered list and the first one that
// mounts wins (see search/scroll.ts).

export const lightingGroupAnchor = (groupKey: string) => `lighting-group:${groupKey}`;
export const lightingDeviceAnchor = (deviceId: string) => `lighting-device:${deviceId}`;
export const coolingGroupAnchor = (blockId: string) => `cooling-group:${blockId}`;

const WIRED_HUB_ID = 'lianli';
const WIRELESS_HUB_ID = 'lianli-wireless';
const OPENRGB_PORT_ID = /^(openrgb-s-.+)-\d+$/;

/** Lighting rail targets for the wired hub. With sync on, the source header
 *  drives the fans: its group or stack, its single card, the board group that
 *  holds the port, then the hub itself. Otherwise the hub's group. */
export function lianLiLightingAnchors(sync?: { argbSync?: boolean; argbSyncSource?: string | null }, hubId = WIRED_HUB_ID): string[] {
  const hub = lightingGroupAnchor(`mb:${hubId}`);
  const source = sync?.argbSync === true ? sync.argbSyncSource : undefined;
  if (!source) return [hub];
  const board = OPENRGB_PORT_ID.exec(source)?.[1];
  return [
    lightingGroupAnchor(`mb:${source}`),
    lightingDeviceAnchor(`${source}:z0`),
    lightingDeviceAnchor(source),
    ...(board ? [lightingGroupAnchor(`mb:${board}`)] : []),
    hub,
  ];
}

/** Cooling rail target for the wired hub: its group. */
export function lianLiCoolingAnchors(hubId = WIRED_HUB_ID): string[] {
  return [coolingGroupAnchor(hubId)];
}

/** Lighting rail target for the wireless controller: its hub group. */
export function lianLiWirelessLightingAnchors(): string[] {
  return [lightingGroupAnchor(`mb:${WIRELESS_HUB_ID}`)];
}

/** Cooling rail targets for the wireless controller: each bound chain's group. */
export function lianLiWirelessCoolingAnchors(macs: readonly string[]): string[] {
  return macs.map(mac => coolingGroupAnchor(`${WIRELESS_HUB_ID}:${mac}`));
}
