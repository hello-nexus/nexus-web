/**
 * OpenRGB cards (ids starting "openrgb-") exist only while the OpenRGB daemon runs. Without it the
 * service still lists held-off snapshots, which no surface may toggle or kill a competing app for.
 * Native cards are untouched. An unknown daemon state hides them too, so nothing flashes in.
 */
export function visibleLightingCards<T extends { id: string; deviceId?: string; parentDeviceId?: string }>(
  cards: readonly T[],
  rgbRunning: boolean,
): T[] {
  if (rgbRunning) return [...cards];
  return cards.filter(c => !(c.parentDeviceId || c.deviceId || c.id).startsWith('openrgb-'));
}

/** Ids the service lists that the response hides, so a persisted id list can tell "hidden" from "gone". */
export function hiddenCardIds(res: { devices: { id: string }[]; allDevices?: { id: string }[] }): Set<string> {
  const shown = new Set(res.devices.map(d => d.id));
  return new Set((res.allDevices ?? []).filter(d => !shown.has(d.id)).map(d => d.id));
}

