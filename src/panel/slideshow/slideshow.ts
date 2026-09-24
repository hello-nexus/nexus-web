import { pluralKey } from '../../lib/pluralKey';
import type { Language } from '../../lib/settings';

/** Seconds a slide holds; one set for the panel background and the gallery widget. */
export const SLIDESHOW_INTERVALS: readonly number[] = [5, 10, 15, 30, 60, 180, 300, 900, 1800, 3600];

// An off-list value (a hand-edited record, an older client) snaps to the
// nearest option so the select always shows the interval that actually runs.
export function normalizeSlideshowInterval(value: number | null | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return fallback;
  return SLIDESHOW_INTERVALS.reduce((best, option) => (
    Math.abs(option - value) < Math.abs(best - value) ? option : best
  ));
}

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** "15 seconds" / "3 minutes" / "1 hour": the largest unit that divides the value. */
export function slideshowIntervalLabel(t: Translate, language: Language, seconds: number): string {
  const unit = seconds % 3600 === 0 ? 'hours' : seconds % 60 === 0 ? 'minutes' : 'seconds';
  const count = unit === 'hours' ? seconds / 3600 : unit === 'minutes' ? seconds / 60 : seconds;
  return t(pluralKey(`slideshow.${unit}`, language, count), { count });
}

/**
 * Every item once, in random order. `avoid` (the item just shown) never leads
 * when there is an alternative, so a lap boundary never repeats a slide.
 */
export function shuffledLap<T>(items: readonly T[], avoid: T | null = null, random: () => number = Math.random): T[] {
  const lap = items.slice();
  for (let i = lap.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [lap[i], lap[j]] = [lap[j], lap[i]];
  }
  if (lap.length > 1 && avoid !== null && lap[0] === avoid) [lap[0], lap[1]] = [lap[1], lap[0]];
  return lap;
}
