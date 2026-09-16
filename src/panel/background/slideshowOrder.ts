import type { BackgroundMediaItem } from '../../api/panelBackgroundMedia';
import { shuffledLap } from '../slideshow/slideshow';

/**
 * The library in display order: the panel's saved order first, then anything
 * it does not name (new imports) oldest first, so a folder import reads and
 * plays in folder order. The service itself lists newest first.
 */
export function orderBackgroundMedia(items: readonly BackgroundMediaItem[], order: readonly string[]): BackgroundMediaItem[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  return items.slice().sort((a, b) => {
    const ra = rank.get(a.id);
    const rb = rank.get(b.id);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return a.importedAtUnixMs - b.importedAtUnixMs;
  });
}

/**
 * One lap over `ordered` (already in display order). `startId` leads the lap
 * when present; without one a lap never opens on `avoidId` (the slide just
 * shown) when it has an alternative.
 */
export function slideshowLap(
  ordered: readonly BackgroundMediaItem[],
  shuffle: boolean,
  startId: string | null,
  avoidId: string | null = null,
  random: () => number = Math.random,
): BackgroundMediaItem[] {
  if (ordered.length < 2) return ordered.slice();
  if (shuffle) {
    const lap = shuffledLap(ordered, ordered.find(item => item.id === avoidId) ?? null, random);
    const at = startId ? lap.findIndex(item => item.id === startId) : -1;
    if (at > 0) [lap[0], lap[at]] = [lap[at], lap[0]];
    return lap;
  }
  const lead = startId ?? avoidId;
  let at = lead ? ordered.findIndex(item => item.id === lead) : -1;
  // Without a start, a lap follows the slide just shown instead of repeating it.
  if (!startId && at >= 0) at = (at + 1) % ordered.length;
  return at > 0 ? [...ordered.slice(at), ...ordered.slice(0, at)] : ordered.slice();
}
