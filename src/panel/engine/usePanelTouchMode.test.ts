import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePanelTouchMode } from './usePanelTouchMode';
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
});
