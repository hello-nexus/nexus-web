import type { CardLayout } from './ReminderTiles';

// Content extents in em of the card the widget draws, so the font size that makes one fill its cell can be solved
// from the cell's pixel box: padding plus the icon, count and name rows.
const PAD_H_EM = 1.1;
const PAD_W_EM = 1.4;
const ICON_EM = 1.7;
const LABEL_EM = 1.2;
const STACK_W_EM = 4;
const NAME_W_EM = 5;
const ROW_W_EM = 11.6;

export const FILL_GAP_PX = 6;
export const MIN_FONT_PX = 10;
export const MAX_FONT_PX = 44;

export interface CardFitInput {
  width: number;
  height: number;
  columns: number;
  rows: number;
  layout: CardLayout;
  labels: boolean;
}

const clamp = (v: number) => Math.max(MIN_FONT_PX, Math.min(MAX_FONT_PX, v));

/** The cell box one card gets when the grid's 1fr tracks share the measured area. */
export function cardCell(width: number, height: number, columns: number, rows: number): { w: number; h: number } {
  return {
    w: (width - FILL_GAP_PX * (columns - 1)) / columns,
    h: (height - FILL_GAP_PX * (rows - 1)) / rows,
  };
}

/** The font size, in px, at which a card's icon, count and name just fit its cell: the tighter of the height and width fits. */
export function cardFontSize({ width, height, columns, rows, layout, labels }: CardFitInput): number {
  const { w, h } = cardCell(width, height, columns, rows);
  const heightEm = PAD_H_EM + ICON_EM + (layout === 'stack' && labels ? LABEL_EM : 0);
  const widthEm = PAD_W_EM + (layout === 'row' ? ROW_W_EM : Math.max(STACK_W_EM, labels ? NAME_W_EM : 0));
  return clamp(Math.min(h / heightEm, w / widthEm));
}

const LIST_ROW_H_EM = 2.5;
const LIST_ROW_W_EM = 12;

/** The font size for a My Lists block of `count` rows sharing `height`, bounded by the width too. */
export function listFontSize(width: number, height: number, count: number): number {
  if (count <= 0) return MIN_FONT_PX;
  return clamp(Math.min(height / count / LIST_ROW_H_EM, width / LIST_ROW_W_EM));
}
