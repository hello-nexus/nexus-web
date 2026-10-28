import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PANEL_CONTEXT_MENU_TRIGGER_MS, PRESS_FEEDBACK_MS, usePanelTouchMode } from './usePanelTouchMode';
import type { PanelWidget } from '../types';

const widget: PanelWidget = {
  id: 'widget-1',
  type: 'clock',
  size: '2x2',
  col: 0,
  row: 0,
  config: {},
};

function pointerEvent(overrides: Partial<React.PointerEvent> = {}): React.PointerEvent {
  const target = document.createElement('div');
  return {
    isPrimary: true,
    pointerType: 'mouse',
    button: 0,
    clientX: 100,
    clientY: 200,
    target,
    currentTarget: target,
    ...overrides,
  } as React.PointerEvent;
}

function contextMenuEvent(overrides: Partial<React.MouseEvent> = {}): React.MouseEvent {
  return {
    button: 2,
    clientX: 100,
    clientY: 200,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...overrides,
  } as React.MouseEvent;
}

describe('usePanelTouchMode', () => {
  it('a tap inside an interactive SDK stage belongs to the app and never opens immersive', () => {
    const onCellTap = vi.fn();
    const { result } = renderHook(() => usePanelTouchMode({ onCellTap }));
    const cell = document.createElement('div');
    const stage = document.createElement('div');
    stage.setAttribute('data-panel-interactive', 'true');
    const sprite = document.createElement('div');
    stage.appendChild(sprite);
    cell.appendChild(stage);
    act(() => {
      result.current.bindCellPointers(widget).onPointerDown(pointerEvent({ target: sprite, currentTarget: cell }));
      result.current.bindCellPointers(widget).onPointerUp(pointerEvent({ target: sprite, currentTarget: cell }));
    });
    expect(onCellTap).not.toHaveBeenCalled();
    act(() => {
      result.current.bindCellPointers(widget).onPointerDown(pointerEvent({ target: cell, currentTarget: cell }));
      result.current.bindCellPointers(widget).onPointerUp(pointerEvent({ target: cell, currentTarget: cell }));
    });
    expect(onCellTap).toHaveBeenCalledTimes(1);
  });

  it('keeps a right-click context menu open after the right mouse button is released', () => {
    const { result } = renderHook(() => usePanelTouchMode({}));

    act(() => {
      result.current.bindCellPointers(widget).onPointerDown(pointerEvent({ button: 2 }));
    });
    act(() => {
      result.current.handleContextMenu(contextMenuEvent(), widget);
    });
    act(() => {
      result.current.bindCellPointers(widget).onPointerUp(pointerEvent({ button: 2 }));
    });

    expect(result.current.ctxMenu?.widget.id).toBe(widget.id);
  });

  it('still dismisses an open context menu on a later left-click release', () => {
    const { result } = renderHook(() => usePanelTouchMode({}));

    act(() => {
      result.current.handleContextMenu(contextMenuEvent(), widget);
    });
    act(() => {
      result.current.bindCellPointers(widget).onPointerDown(pointerEvent({ button: 0 }));
    });
    act(() => {
      result.current.bindCellPointers(widget).onPointerUp(pointerEvent({ button: 0 }));
    });

    expect(result.current.ctxMenu).toBeNull();
  });

  it('gives a right-click on another widget a fresh menu seq while a menu is open', () => {
    const other: PanelWidget = { ...widget, id: 'widget-2', col: 2 };
    const { result } = renderHook(() => usePanelTouchMode({}));

    act(() => {
      result.current.handleContextMenu(contextMenuEvent(), widget);
    });
    const firstSeq = result.current.ctxMenu?.seq;
    act(() => {
      result.current.bindCellPointers(other).onPointerDown(pointerEvent({ button: 2 }));
    });
    act(() => {
      result.current.handleContextMenu(contextMenuEvent({ clientX: 400 }), other);
    });
    act(() => {
      result.current.bindCellPointers(other).onPointerUp(pointerEvent({ button: 2 }));
    });

    expect(result.current.ctxMenu?.widget.id).toBe(other.id);
    expect(result.current.ctxMenu?.seq).not.toBe(firstSeq);
  });

  describe('host-opened menu', () => {
    // The release of the host-reported click must reach neither a widget nor the background handler.
    function setup() {
      const tileB = document.createElement('div');
      tileB.setAttribute('data-panel-widget-id', 'widget-2');
      document.body.appendChild(tileB);
      const tileSeen = vi.fn();
      const backgroundSeen = vi.fn();
      tileB.addEventListener('contextmenu', tileSeen);
      document.body.addEventListener('contextmenu', backgroundSeen);
      const hook = renderHook(() => usePanelTouchMode({}));
      act(() => { hook.result.current.openCtxMenu(widget, 50, 60); });
      const cleanup = () => {
        document.body.removeEventListener('contextmenu', backgroundSeen);
        tileB.remove();
        hook.unmount();
      };
      return { hook, tileB, tileSeen, backgroundSeen, cleanup };
    }
    const release = (target: EventTarget) => {
      const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
      act(() => { target.dispatchEvent(e); });
      return e;
    };

    it('drops a release over another tile and keeps the menu', () => {
      const { hook, tileB, tileSeen, backgroundSeen, cleanup } = setup();
      const seq = hook.result.current.ctxMenu?.seq;
      expect(release(tileB).defaultPrevented).toBe(true);
      expect(tileSeen).not.toHaveBeenCalled();
      expect(backgroundSeen).not.toHaveBeenCalled();
      expect(hook.result.current.ctxMenu).toMatchObject({ widget: { id: widget.id }, x: 50, y: 60, seq });
      cleanup();
    });

    it('drops a release over empty space', () => {
      const { backgroundSeen, cleanup } = setup();
      expect(release(document.body).defaultPrevented).toBe(true);
      expect(backgroundSeen).not.toHaveBeenCalled();
      cleanup();
    });

    it('lets a right-click that starts with a page press through', () => {
      const { tileB, tileSeen, cleanup } = setup();
      act(() => { window.dispatchEvent(new Event('pointerdown')); });
      release(tileB);
      expect(tileSeen).toHaveBeenCalledTimes(1);
      cleanup();
    });

    it('drops only one release', () => {
      const { tileB, tileSeen, cleanup } = setup();
      release(tileB);
      release(tileB);
      expect(tileSeen).toHaveBeenCalledTimes(1);
      cleanup();
    });
  });

  describe('long-press menu', () => {
    beforeEach(() => vi.useFakeTimers());
    let cleanup: () => void = () => {};
    afterEach(() => { cleanup(); cleanup = () => {}; vi.useRealTimers(); });

    function setup(mouseLongPress = false) {
      const tile = document.createElement('div');
      document.body.appendChild(tile);
      const hook = renderHook(() => usePanelTouchMode({ mouseLongPress }));
      // Stands in for the React root listener that routes a cell's contextmenu to the hook.
      const root = (e: Event) => { hook.result.current.handleContextMenu(e as unknown as React.MouseEvent, widget); };
      tile.addEventListener('contextmenu', root);
      const press = (pointerType: string) => act(() => {
        hook.result.current.bindCellPointers(widget).onPointerDown(pointerEvent({ pointerType }));
        vi.advanceTimersByTime(PANEL_CONTEXT_MENU_TRIGGER_MS);
      });
      const nativeMenu = () => {
        const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 200 });
        act(() => { tile.dispatchEvent(e); });
        return e;
      };
      cleanup = () => { tile.remove(); hook.unmount(); };
      return { hook, tile, press, nativeMenu };
    }

    it('keeps the menu seq when the contextmenu that follows the hold arrives', () => {
      const { hook, press, nativeMenu } = setup();
      press('touch');
      const seq = hook.result.current.ctxMenu?.seq;
      expect(seq).toBeDefined();
      expect(nativeMenu().defaultPrevented).toBe(true);
      expect(hook.result.current.ctxMenu?.seq).toBe(seq);
    });

    it('keeps the menu seq when contextmenu arrives mid-hold and the timer elapses after', () => {
      const { hook, tile, nativeMenu } = setup();
      act(() => {
        hook.result.current.bindCellPointers(widget).onPointerDown(pointerEvent({ pointerType: 'touch' }));
        vi.advanceTimersByTime(PANEL_CONTEXT_MENU_TRIGGER_MS - 1);
      });
      nativeMenu();
      const seq = hook.result.current.ctxMenu?.seq;
      expect(seq).toBeDefined();
      act(() => { vi.advanceTimersByTime(PANEL_CONTEXT_MENU_TRIGGER_MS); });
      expect(hook.result.current.ctxMenu?.seq).toBe(seq);
      // Nothing armed the swallow, so a later separate contextmenu still reopens.
      act(() => { window.dispatchEvent(new Event('pointerdown')); });
      nativeMenu();
      expect(hook.result.current.ctxMenu?.seq).toBeGreaterThan(seq as number);
      expect(tile.isConnected).toBe(true);
    });

    it('re-opens on a second long-press and on a later separate contextmenu', () => {
      const { hook, press, nativeMenu } = setup();
      press('touch');
      nativeMenu();
      const first = hook.result.current.ctxMenu?.seq as number;
      press('touch');
      const second = hook.result.current.ctxMenu?.seq as number;
      expect(second).toBeGreaterThan(first);
      nativeMenu();
      act(() => { window.dispatchEvent(new Event('pointerdown')); });
      nativeMenu();
      expect(hook.result.current.ctxMenu?.seq).toBeGreaterThan(second);
    });
  });

  describe('press feedback', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('shrinks a held touch after the dead time and snaps back when the menu opens', () => {
      const { result } = renderHook(() => usePanelTouchMode({}));

      act(() => {
        result.current.bindCellPointers(widget).onPointerDown(pointerEvent({ pointerType: 'touch' }));
      });
      act(() => vi.advanceTimersByTime(PRESS_FEEDBACK_MS - 1));
      expect(result.current.pressedWidgetId).toBeNull();

      act(() => vi.advanceTimersByTime(1));
      expect(result.current.pressedWidgetId).toBe(widget.id);

      act(() => vi.advanceTimersByTime(PANEL_CONTEXT_MENU_TRIGGER_MS - PRESS_FEEDBACK_MS));
      expect(result.current.ctxMenu?.widget.id).toBe(widget.id);
      expect(result.current.pressedWidgetId).toBeNull();
    });

    it('does not shrink under a mouse unless the mouse is the finger', () => {
      const plain = renderHook(() => usePanelTouchMode({}));
      act(() => {
        plain.result.current.bindCellPointers(widget).onPointerDown(pointerEvent());
      });
      act(() => vi.advanceTimersByTime(PANEL_CONTEXT_MENU_TRIGGER_MS));
      expect(plain.result.current.pressedWidgetId).toBeNull();

      const finger = renderHook(() => usePanelTouchMode({ mouseLongPress: true }));
      act(() => {
        finger.result.current.bindCellPointers(widget).onPointerDown(pointerEvent());
      });
      act(() => vi.advanceTimersByTime(PRESS_FEEDBACK_MS));
      expect(finger.result.current.pressedWidgetId).toBe(widget.id);
    });

    it('releases the shrink at the drift that cancels the long-press', () => {
      const { result } = renderHook(() => usePanelTouchMode({}));
      act(() => {
        result.current.bindCellPointers(widget).onPointerDown(pointerEvent({ pointerType: 'touch' }));
      });
      act(() => vi.advanceTimersByTime(PRESS_FEEDBACK_MS));
      expect(result.current.pressedWidgetId).toBe(widget.id);

      act(() => {
        result.current.bindCellPointers(widget).onPointerMove(pointerEvent({ pointerType: 'touch', clientX: 110 }));
      });
      expect(result.current.pressedWidgetId).toBeNull();
      act(() => vi.advanceTimersByTime(PANEL_CONTEXT_MENU_TRIGGER_MS));
      expect(result.current.ctxMenu).toBeNull();
    });
  });

  describe('menuDisabled (Windows OOBE)', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('a long-press never opens the context menu', () => {
      const { result } = renderHook(() => usePanelTouchMode({ menuDisabled: true }));
      act(() => {
        result.current.bindCellPointers(widget).onPointerDown(pointerEvent({ pointerType: 'touch' }));
        vi.advanceTimersByTime(PANEL_CONTEXT_MENU_TRIGGER_MS + 50);
      });
      expect(result.current.ctxMenu).toBeNull();
    });

    it('a right-click and the host-reported menu stay closed, and the browser menu is still suppressed', () => {
      const { result } = renderHook(() => usePanelTouchMode({ menuDisabled: true }));
      const e = contextMenuEvent();
      act(() => {
        result.current.handleContextMenu(e, widget);
        result.current.openCtxMenu(widget, 10, 10);
      });
      expect(e.preventDefault).toHaveBeenCalled();
      expect(result.current.ctxMenu).toBeNull();
    });

    it('a tap still reaches onCellTap', () => {
      const onCellTap = vi.fn();
      const { result } = renderHook(() => usePanelTouchMode({ onCellTap, menuDisabled: true }));
      act(() => {
        result.current.bindCellPointers(widget).onPointerDown(pointerEvent({ pointerType: 'touch' }));
        result.current.bindCellPointers(widget).onPointerUp(pointerEvent({ pointerType: 'touch' }));
      });
      expect(onCellTap).toHaveBeenCalledTimes(1);
    });
  });
});
