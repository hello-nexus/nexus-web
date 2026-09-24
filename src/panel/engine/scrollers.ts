export type ScrollAxis = 'x' | 'y';

/**
 * Nearest ancestor of `start` (stopping before `until`) that actually
 * scrolls on `axis`: an overflow of auto/scroll with content larger than
 * its box. What native touch scrolling would move.
 */
export function findScroller(start: Element | null, until: HTMLElement, axis: ScrollAxis): HTMLElement | null {
  let node = start instanceof HTMLElement ? start : null;
  while (node && node !== until) {
    const style = getComputedStyle(node);
    const overflow = axis === 'y' ? style.overflowY : style.overflowX;
    const overflows = axis === 'y'
      ? node.scrollHeight > node.clientHeight + 1
      : node.scrollWidth > node.clientWidth + 1;
    if ((overflow === 'auto' || overflow === 'scroll') && overflows) return node;
    node = node.parentElement;
  }
  return null;
}
