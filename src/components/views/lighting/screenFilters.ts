import type { PostProcessSettings } from '../../../api/lighting';

export type ScreenFilterKey = 'normal' | 'bw' | 'highsat' | 'mirrorx' | 'mirrory';

export interface ScreenFilter {
  readonly key: ScreenFilterKey;
  readonly i18nKey: string;
  readonly pp: Required<PostProcessSettings>;
}

export const SCREEN_FILTERS: readonly ScreenFilter[] = [
  { key: 'normal',  i18nKey: 'lighting.filter.normal',
    pp: { hue: 0, colorize: 0, saturation: 1,   contrast: 1,   flipX: false, flipY: false } },
  { key: 'bw',      i18nKey: 'lighting.filter.bw',
    pp: { hue: 0, colorize: 0, saturation: 0,   contrast: 1.1, flipX: false, flipY: false } },
  { key: 'highsat', i18nKey: 'lighting.filter.highsat',
    pp: { hue: 0, colorize: 0, saturation: 1.8, contrast: 1,   flipX: false, flipY: false } },
  { key: 'mirrorx', i18nKey: 'lighting.filter.mirrorx',
    pp: { hue: 0, colorize: 0, saturation: 1,   contrast: 1,   flipX: true,  flipY: false } },
  { key: 'mirrory', i18nKey: 'lighting.filter.mirrory',
    pp: { hue: 0, colorize: 0, saturation: 1,   contrast: 1,   flipX: false, flipY: true  } },
];

export const DEFAULT_SCREEN_FILTER: ScreenFilterKey = 'normal';

const EPSILON = 0.001;
const nearly = (a: number, b: number) => Math.abs(a - b) < EPSILON;

export function matchScreenFilter(pp: PostProcessSettings | null | undefined): ScreenFilterKey | null {
  if (!pp) return null;
  for (const f of SCREEN_FILTERS) {
    if (
      nearly(pp.hue, f.pp.hue) &&
      nearly(pp.colorize, f.pp.colorize) &&
      nearly(pp.saturation, f.pp.saturation) &&
      nearly(pp.contrast, f.pp.contrast) &&
      !!pp.flipX === f.pp.flipX &&
      !!pp.flipY === f.pp.flipY
    ) {
      return f.key;
    }
  }
  return null;
}

export function screenFilterByKey(key: ScreenFilterKey): ScreenFilter {
  return SCREEN_FILTERS.find(f => f.key === key) ?? SCREEN_FILTERS[0];
}
