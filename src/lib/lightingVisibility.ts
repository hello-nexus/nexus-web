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


/** The saved card order against the service's ids: drops ids that are gone, keeps hidden ones in place, appends new ones. */
export function reconcileDeviceOrder(prev: readonly string[], ids: readonly string[], hidden: ReadonlySet<string>): string[] {
  const live = new Set(ids);
  const kept = prev.filter(id => live.has(id) || hidden.has(id));
  for (const id of ids) if (!kept.includes(id)) kept.push(id);
  return kept.length === prev.length && kept.every((id, i) => id === prev[i]) ? [...prev] : kept;
}

/** A refreshed list in the order already shown, with each kept card's fresh state, and cards that just arrived appended. */
export function appendNewCards<T extends { id: string }>(prev: readonly T[], fresh: readonly T[]): T[] {
  const byId = new Map(fresh.map(c => [c.id, c]));
  const listed = new Set(prev.map(c => c.id));
  return [...prev.filter(c => byId.has(c.id)).map(c => byId.get(c.id)!), ...fresh.filter(c => !listed.has(c.id))];
}
