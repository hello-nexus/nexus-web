import { describe, expect, it } from 'vitest';
import { measureStack } from './useStackOnOverflow';

function footer(scrollWidth: number, clientWidth: number) {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollWidth', { value: scrollWidth });
  Object.defineProperty(el, 'clientWidth', { value: clientWidth });
  return el;
}

describe('measureStack', () => {
  it('stacks when the row overflows', () => {
    const el = footer(120, 100);
    measureStack(el, 'stacked');
    expect(el.classList.contains('stacked')).toBe(true);
  });

  it('does not stack at equal width or one pixel of rounding', () => {
    for (const sw of [100, 101]) {
      const el = footer(sw, 100);
      measureStack(el, 'stacked');
      expect(el.classList.contains('stacked')).toBe(false);
    }
  });

  it('drops a stale stacked class when the row fits again', () => {
    const el = footer(100, 100);
    el.classList.add('stacked');
    measureStack(el, 'stacked');
    expect(el.classList.contains('stacked')).toBe(false);
  });
});
