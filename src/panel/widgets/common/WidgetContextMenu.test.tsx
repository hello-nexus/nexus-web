// A right-click on another widget while a menu is up fires an outside
// pointerdown (which starts this menu's close timer) and then a
// contextmenu that PanelApp turns into a keyed remount. The remount must
// leave the new menu open: the old instance's timer dies with it.
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WidgetContextMenu } from './WidgetContextMenu';

function menu(key: number, onClose: () => void) {
  return (
    <WidgetContextMenu
      key={key}
      x={100}
      y={100}
      currentSize="2x2"
      sizes={['2x2']}
      hasConfig={false}
      surface="desktop"
      onResize={vi.fn()}
      onEdit={vi.fn()}
      onRemove={vi.fn()}
      onClose={onClose}
    />
  );
}

describe('WidgetContextMenu', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('closes after an outside pointerdown', () => {
    const onClose = vi.fn();
    render(menu(1, onClose));
    act(() => { document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
    act(() => { vi.advanceTimersByTime(200); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a keyed remount after the outside pointerdown stays open', () => {
    const firstClose = vi.fn();
    const secondClose = vi.fn();
    const { rerender } = render(menu(1, firstClose));
    act(() => { document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
    rerender(menu(2, secondClose));
    act(() => { vi.advanceTimersByTime(200); });
    expect(firstClose).not.toHaveBeenCalled();
    expect(secondClose).not.toHaveBeenCalled();
  });
});

// A panel scales the menu up; it scales about --menu-origin, so the layout box
// must sit where the painted (scaled) box ends up clamped inside the viewport.
describe('WidgetContextMenu on a scaled panel', () => {
  const descriptors = {
    rect: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'getBoundingClientRect'),
    ow: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth'),
    oh: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight'),
  };
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 200 });
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 100 });
    HTMLElement.prototype.getBoundingClientRect = () => ({ width: 600, height: 300, x: 0, y: 0, top: 0, left: 0, right: 600, bottom: 300, toJSON: () => ({}) }) as DOMRect;
    vi.stubGlobal('innerWidth', 720);
    vi.stubGlobal('innerHeight', 1280);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (descriptors.ow) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', descriptors.ow);
    if (descriptors.oh) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', descriptors.oh);
    if (descriptors.rect) Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', descriptors.rect);
  });

  it('keeps a right-edge click on screen instead of throwing the menu left', () => {
    const { container } = render(
      <WidgetContextMenu x={700} y={100} currentSize="2x2" sizes={['2x2']} hasConfig={false} surface="q60"
        onResize={vi.fn()} onEdit={vi.fn()} onRemove={vi.fn()} onClose={vi.fn()} />,
    );
    const el = [...container.ownerDocument.querySelectorAll<HTMLElement>('[style]')].find(n => n.style.getPropertyValue('--menu-origin-x'))!;
    const left = parseFloat(el.style.left);
    const origin = parseFloat(el.style.getPropertyValue('--menu-origin-x'));
    // Painted left edge = layout left + origin * (1 - scale), scale 3.
    const paintedLeft = left + origin * (1 - 3);
    expect(paintedLeft).toBeCloseTo(720 - 600 - 8);
    expect(origin).toBeLessThanOrEqual(200);
  });
});
