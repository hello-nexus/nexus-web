// Scroll-and-shine targets for a device page's jump to the Lighting or Cooling
// page. Each builder names the element the destination page tags with
// data-search-anchor; a jump passes an ordered list and the first one that
// mounts wins (see search/scroll.ts).

export const lightingGroupAnchor = (groupKey: string) => `lighting-group:${groupKey}`;
export const lightingDeviceAnchor = (deviceId: string) => `lighting-device:${deviceId}`;
export const coolingGroupAnchor = (blockId: string) => `cooling-group:${blockId}`;
export const coolingFanAnchor = (channelId: string) => `cooling-fan:${channelId}`;

const WIRED_HUB_ID = 'lianli';
const WIRELESS_HUB_ID = 'lianli-wireless';
const WIRED_PORT_COUNT = 4;

/** Lighting rail targets for the wired hub: the source ARGB header while sync
 *  drives its fans through it, otherwise the hub's own group. */
export function lianLiLightingAnchors(sync?: { argbSync?: boolean; argbSyncSource?: string | null }): string[] {
  const source = sync?.argbSync === true ? sync.argbSyncSource : undefined;
  if (source) return [lightingGroupAnchor(`mb:${source}`), lightingDeviceAnchor(`${source}:z0`)];
  return [lightingGroupAnchor(`mb:${WIRED_HUB_ID}`), lightingDeviceAnchor(`${WIRED_HUB_ID}:port0`)];
}

/** Cooling rail targets for the wired hub: its group, else its first channel. */
export function lianLiCoolingAnchors(): string[] {
  return [
    coolingGroupAnchor(WIRED_HUB_ID),
    ...Array.from({ length: WIRED_PORT_COUNT }, (_, p) => coolingFanAnchor(`${WIRED_HUB_ID}:port${p}`)),
  ];
}

/** Lighting rail targets for the wireless controller: its hub group, else a bound chain's card. */
export function lianLiWirelessLightingAnchors(macs: readonly string[]): string[] {
  return [
    lightingGroupAnchor(`mb:${WIRELESS_HUB_ID}`),
    ...macs.map(mac => lightingDeviceAnchor(`${WIRELESS_HUB_ID}:${mac}`)),
  ];
}

/** Cooling rail targets for the wireless controller: each bound chain's group. */
export function lianLiWirelessCoolingAnchors(macs: readonly string[]): string[] {
  return macs.map(mac => coolingGroupAnchor(`${WIRELESS_HUB_ID}:${mac}`));
}
