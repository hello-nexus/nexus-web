import type { WebViewRect } from './webViewProtocol';

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function px(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

export interface TileMeasure {
  rect: WebViewRect;
  /** The element that must be topmost over the rect. */
  target: Element;
  radius: number;
}

/**
 * The rect the user sees as the tile. A tile's placeholder sits inside a
 * scaler that can be wider than the clipped card, and a native view is not
 * clipped by the card, so the card's content box is measured instead. Outside
 * a card (the immersive overlay) the placeholder itself is the tile, square.
 */
export function measureTile(el: HTMLElement): TileMeasure {
  const card = el.closest('.panel-card');
  if (!card) {
    const r = el.getBoundingClientRect();
    return { rect: { x: round1(r.left), y: round1(r.top), w: round1(r.width), h: round1(r.height) }, target: el, radius: 0 };
  }
  const r = card.getBoundingClientRect();
  const cs = getComputedStyle(card);
  const left = px(cs.borderLeftWidth) + px(cs.paddingLeft);
  const right = px(cs.borderRightWidth) + px(cs.paddingRight);
  const top = px(cs.borderTopWidth) + px(cs.paddingTop);
  const bottom = px(cs.borderBottomWidth) + px(cs.paddingBottom);
  const rect = {
    x: round1(r.left + left),
    y: round1(r.top + top),
    w: round1(Math.max(0, r.width - left - right)),
    h: round1(Math.max(0, r.height - top - bottom)),
  };
  const radius = Math.max(0, px(cs.borderTopLeftRadius) - Math.max(px(cs.borderLeftWidth), px(cs.borderTopWidth)));
  return { rect, target: card, radius: round1(Math.min(radius, rect.w / 2, rect.h / 2)) };
}
