// Resolves a slot's title-style overrides against their defaults so the
// on-screen DeckGrid cell and the uploaded key bitmap render the same shape
// from the same sparse, partial DeckSlot.title.
import type { DeckSlot } from './types';

export type DeckTitleAlign = 'top' | 'middle' | 'bottom';

export interface DeckTitleFontOption {
  id: string;
  // CSS font-family stack; '' means "inherit the surface's default font".
  family: string;
  // Proper-noun display name for the picker; absent for 'default', whose
  // label the caller translates via t('panel.settings.deck.titleStyle.fontDefault').
  label?: string;
}

export const DECK_TITLE_FONTS: readonly DeckTitleFontOption[] = [
  { id: 'default', family: '' },
  { id: 'arial', family: 'Arial, Helvetica, sans-serif', label: 'Arial' },
  { id: 'georgia', family: 'Georgia, "Times New Roman", serif', label: 'Georgia' },
  { id: 'courierNew', family: '"Courier New", Courier, monospace', label: 'Courier New' },
];

export const DECK_TITLE_SIZE_MIN = 8;
export const DECK_TITLE_SIZE_MAX = 30;
export const DECK_TITLE_SIZE_DEFAULT = 16;

export interface ResolvedDeckTitleStyle {
  show: boolean;
  align: DeckTitleAlign;
  fontFamily: string;
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string;
}

function clampTitleSize(size: number): number {
  return Math.min(DECK_TITLE_SIZE_MAX, Math.max(DECK_TITLE_SIZE_MIN, Math.round(size)));
}

export function resolveDeckTitleStyle(title: DeckSlot['title']): ResolvedDeckTitleStyle {
  const fontOption = DECK_TITLE_FONTS.find(f => f.id === title?.font) ?? DECK_TITLE_FONTS[0];
  return {
    show: title?.show ?? true,
    align: title?.align ?? 'middle',
    fontFamily: fontOption.family,
    size: clampTitleSize(title?.size ?? DECK_TITLE_SIZE_DEFAULT),
    bold: title?.bold ?? false,
    italic: title?.italic ?? false,
    underline: title?.underline ?? false,
    color: title?.color ?? '#ffffff',
  };
}

// `size` is a percentage of the key's edge length (a square key, so also its
// container-query min dimension) - cqmin maps onto it directly. The min/max
// guards keep tiny/huge widget tiles from paying it out too literally.
export function titleFontSizeCss(size: number): string {
  const s = clampTitleSize(size);
  const min = Math.max(6, Math.round(s * 0.65));
  const max = Math.round(s * 1.3);
  return `clamp(${min}px, ${s}cqmin, ${max}px)`;
}
