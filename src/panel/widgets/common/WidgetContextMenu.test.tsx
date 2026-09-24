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
