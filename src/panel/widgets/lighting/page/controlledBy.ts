import type { DetectedConflict } from '../../../../api/conflicts';
import type { LightingDevice } from '../../../../api/lighting';

/** What a card's "controlled by" strip names: the running apps that compete for its hardware. */
export interface CardAppStrip {
  apps: readonly { id: string; name: string }[];
  /** False only when Nexus drives none of the device's cards: the strip then reads "Controlled by", not "running". */
  controlled: boolean;
}

function cardAppIds(card: LightingDevice, curatedAppByHandler: ReadonlyMap<string, string>): readonly string[] {
  if (card.controlHandlerId) {
    const id = curatedAppByHandler.get(card.controlHandlerId);
    return id ? [id] : [];
  }
  return card.conflictAppIds ?? [];
}

/** Detected apps for one card, one entry per app, vendor-specific apps before the universal RGB ones. */
export function conflictAppsForCard(
  card: LightingDevice,
  conflicts: readonly DetectedConflict[],
  curatedAppByHandler: ReadonlyMap<string, string>,
): DetectedConflict[] {
  const ids = new Set(cardAppIds(card, curatedAppByHandler));
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
 * One strip per device, hosted by the last of its cards in list order (a
 * stacked device's bottom zone), keyed by that card's id. Cards of one
 * device share a key: the hub handler when curated, else the OpenRGB device.
 */
export function controlledByStrips(
  cards: readonly LightingDevice[],
  conflicts: readonly DetectedConflict[],
  curatedAppByHandler: ReadonlyMap<string, string>,
): Map<string, CardAppStrip> {
  const result = new Map<string, CardAppStrip>();
  if (conflicts.length === 0) return result;
  const byDevice = new Map<string, LightingDevice[]>();
  for (const card of cards) {
    const key = card.controlHandlerId ?? card.deviceId ?? card.id;
    const bucket = byDevice.get(key);
    if (bucket) bucket.push(card);
    else byDevice.set(key, [card]);
  }
  for (const members of byDevice.values()) {
    const apps = conflictAppsForCard(members[0], conflicts, curatedAppByHandler);
    if (apps.length === 0) continue;
    result.set(members[members.length - 1].id, {
      apps: apps.map(a => ({ id: a.id, name: a.displayName })),
      controlled: members.some(m => m.controlled !== false),
    });
  }
  return result;
}
