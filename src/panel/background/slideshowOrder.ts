import type { BackgroundMediaItem } from '../../api/panelBackgroundMedia';

/**
 * One lap of the slideshow over `items`. In order = import order (oldest
 * first), which is folder order for a folder import: the library itself lists
 * newest first for the grid. `startId` leads the lap when present so the
 * slide the user picked is the one the cycle opens on; a shuffled lap never
 * opens on `avoidId` (the slide just shown) when it has an alternative.
 */
export function slideshowLap(
  items: readonly BackgroundMediaItem[],
  shuffle: boolean,
  startId: string | null,
  avoidId: string | null = null,
  random: () => number = Math.random,
): BackgroundMediaItem[] {
  const ordered = items.slice().sort((a, b) => a.importedAtUnixMs - b.importedAtUnixMs);
  if (ordered.length < 2) return ordered;
  if (shuffle) {
    for (let i = ordered.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
    }
    const lead = startId ?? avoidId;
    const at = lead ? ordered.findIndex(item => item.id === lead) : -1;
    if (at > 0 && startId) [ordered[0], ordered[at]] = [ordered[at], ordered[0]];
    else if (at === 0 && !startId) [ordered[0], ordered[1]] = [ordered[1], ordered[0]];
    return ordered;
  }
  const at = startId ? ordered.findIndex(item => item.id === startId) : -1;
  return at > 0 ? [...ordered.slice(at), ...ordered.slice(0, at)] : ordered;
}
