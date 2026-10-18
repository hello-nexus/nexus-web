import type { DetectedConflict } from '../../../../api/conflicts';
import type { LightingDevice } from '../../../../api/lighting';

/** What a card's "controlled by" strip names: the running apps that compete for its hardware. */
export interface CardAppStrip {
  apps: readonly { id: string; name: string }[];
  /** False only when Nexus drives none of the device's cards: the strip then reads "Controlled by", not "running". */
  controlled: boolean;
}

/** A curated handler's competing app and whether its Nexus Control gate is on (from /devices/all). */
export interface CuratedControl {
  appId: string;
  enabled: boolean;
}

export type CuratedControlByHandler = ReadonlyMap<string, CuratedControl>;

function cardAppIds(card: LightingDevice, curated: CuratedControlByHandler): readonly string[] {
  if (card.controlHandlerId) {
    const id = curated.get(card.controlHandlerId)?.appId;
    return id ? [id] : [];
  }
  return card.conflictAppIds ?? [];
}

/** Nexus drives the card: its own flag is on and, for a hub card, so is the hub's gate. */
function cardControlled(card: LightingDevice, curated: CuratedControlByHandler): boolean {
  if (card.controlled === false) return false;
  return !(card.controlHandlerId && curated.get(card.controlHandlerId)?.enabled === false);
}

/** Detected apps for one card, one entry per app, vendor-specific apps before the universal RGB ones. */
export function conflictAppsForCard(
  card: LightingDevice,
  conflicts: readonly DetectedConflict[],
  curated: CuratedControlByHandler,
): DetectedConflict[] {
  const ids = new Set(cardAppIds(card, curated));
  if (ids.size === 0) return [];
  const seen = new Set<string>();
  const matched = conflicts.filter(c => {
    if (!ids.has(c.id) || seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
  return [...matched.filter(c => !c.claimsAllRgb), ...matched.filter(c => c.claimsAllRgb)];
}

/**
 * One strip per physical device (cards sharing a deviceId are its zones),
 * keyed by the card that hosts it: the last visible zone that can show one.
 * The app list and the gray/amber state come from every zone of the device,
 * not just the visible ones, so a search or the hide filter cannot flip them.
 * A handler id spans many devices (every Corsair device shares one), so it
 * only drives the app lookup, never the grouping.
 */
export function controlledByStrips(
  all: readonly LightingDevice[],
  visible: readonly LightingDevice[],
  conflicts: readonly DetectedConflict[],
  curated: CuratedControlByHandler,
  canHost: (card: LightingDevice) => boolean,
): Map<string, CardAppStrip> {
  const result = new Map<string, CardAppStrip>();
  if (conflicts.length === 0) return result;
  const byDevice = new Map<string, LightingDevice[]>();
  for (const card of all) {
    const key = card.deviceId || card.id;
    const bucket = byDevice.get(key);
    if (bucket) bucket.push(card);
    else byDevice.set(key, [card]);
  }
  const visibleIds = new Set(visible.map(v => v.id));
  for (const members of byDevice.values()) {
    const host = members.findLast(m => visibleIds.has(m.id) && canHost(m));
    if (!host) continue;
    const apps = conflictAppsForCard(members[0], conflicts, curated);
    if (apps.length === 0) continue;
    result.set(host.id, {
      apps: apps.map(a => ({ id: a.id, name: a.displayName })),
      controlled: members.some(m => cardControlled(m, curated)),
    });
  }
  return result;
}
