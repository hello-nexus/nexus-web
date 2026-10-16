import { describe, expect, it } from 'vitest';
import { measureTile } from './webViewMeasure';

function box(el: HTMLElement, r: { x: number; y: number; w: number; h: number }) {
  el.getBoundingClientRect = () => ({
    left: r.x, top: r.y, width: r.w, height: r.h, right: r.x + r.w, bottom: r.y + r.h, x: r.x, y: r.y, toJSON: () => ({}),
  });
}

describe('measureTile', () => {
  it('measures the visible card content box, not the wider scaler', () => {
    const card = document.createElement('div');
    card.className = 'panel-card';
    card.style.border = '1px solid red';
    card.style.padding = '4px';
    card.style.borderTopLeftRadius = '20px';
    const scaler = document.createElement('div');
    card.appendChild(scaler);
    document.body.appendChild(card);
    box(card, { x: 15, y: 10, w: 704, h: 500 });
    box(scaler, { x: 0, y: 10, w: 734, h: 500 });
    const m = measureTile(scaler);
    expect(m.target).toBe(card);
    expect(m.rect).toEqual({ x: 20, y: 15, w: 694, h: 490 });
    expect(m.radius).toBe(19);
    card.remove();
  });

  it('uses the element itself with a square corner outside a card', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    box(el, { x: 0, y: 44, w: 800, h: 900 });
    const m = measureTile(el);
    expect(m.target).toBe(el);
    expect(m.rect).toEqual({ x: 0, y: 44, w: 800, h: 900 });
    expect(m.radius).toBe(0);
    el.remove();
  });
});
