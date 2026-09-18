import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePanelDragScroll } from './usePanelDragScroll';
import { claimGestureAxis, resetGestureAxis } from './gestureAxisLock';
import { PANEL_CONTEXT_MENU_TRIGGER_MS } from './usePanelTouchMode';

function Harness({ enabled, marked = false, onClick }: { enabled: boolean; marked?: boolean; onClick?: () => void }) {
  usePanelDragScroll(enabled);
  return (
    <div data-testid="root">
      <div
        data-testid="pane"
        data-panel-scrollable={marked ? 'true' : undefined}
        style={{ overflowY: 'auto' }}
        ref={node => {
          if (!node) return;
          Object.defineProperty(node, 'scrollHeight', { value: 2000, configurable: true });
          Object.defineProperty(node, 'clientHeight', { value: 300, configurable: true });
          node.scrollTop = 500;
        }}
      >
        <div data-testid="content">content</div>
        <button data-testid="button" onClick={onClick}>b</button>
      </div>
    </div>
  );
}

function pointer(target: Element, type: string, x: number, y: number, t: number, buttons = 1) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, buttons, button: 0 });
  Object.defineProperties(event, {
    pointerType: { value: 'mouse' },
    isPrimary: { value: true },
    pointerId: { value: 1 },
    timeStamp: { value: t },
  });
  target.dispatchEvent(event);
}

describe('usePanelDragScroll', () => {
  it('does nothing when disabled', () => {
    render(<Harness enabled={false} />);
    const pane = screen.getByTestId('pane');
    const content = screen.getByTestId('content');
    act(() => {
      pointer(content, 'pointerdown', 100, 200, 0);
      pointer(content, 'pointermove', 100, 100, 16);
    });
    expect(pane.scrollTop).toBe(500);
  });

  it('scrolls the pane under the pointer with the drag when enabled', () => {
    render(<Harness enabled={true} />);
    const pane = screen.getByTestId('pane');
    const content = screen.getByTestId('content');
    act(() => {
      pointer(content, 'pointerdown', 100, 200, 0);
      pointer(content, 'pointermove', 100, 100, 16);
    });
    expect(pane.scrollTop).toBe(600);
  });

  it('swallows the click that lands where an engaged scroll ends, and only that one', () => {
    const onClick = vi.fn();
    render(<Harness enabled={true} onClick={onClick} />);
    const content = screen.getByTestId('content');
    const button = screen.getByTestId('button');
    act(() => {
      pointer(content, 'pointerdown', 100, 200, 0);
      pointer(content, 'pointermove', 100, 100, 16);
      pointer(content, 'pointerup', 100, 100, 32, 0);
    });
    act(() => { button.click(); });
    expect(onClick).not.toHaveBeenCalled();
    act(() => { button.click(); });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('yields a press held past the drag-arm mark to dnd outside a marked pane', () => {
    render(<Harness enabled={true} />);
    const pane = screen.getByTestId('pane');
    const content = screen.getByTestId('content');
    act(() => {
      pointer(content, 'pointerdown', 100, 200, 0);
      pointer(content, 'pointermove', 100, 100, PANEL_CONTEXT_MENU_TRIGGER_MS + 1);
    });
    expect(pane.scrollTop).toBe(500);
  });

  it('still scrolls a marked pane after a long hold, where dnd never arms', () => {
    render(<Harness enabled={true} marked />);
    const pane = screen.getByTestId('pane');
    const content = screen.getByTestId('content');
    act(() => {
      pointer(content, 'pointerdown', 100, 200, 0);
      pointer(content, 'pointermove', 100, 100, PANEL_CONTEXT_MENU_TRIGGER_MS + 1);
    });
    expect(pane.scrollTop).toBe(600);
  });

  it('releases a stale axis claim at each press', () => {
    render(<Harness enabled={true} />);
    const pane = screen.getByTestId('pane');
    const content = screen.getByTestId('content');
    claimGestureAxis('horizontal');
    act(() => {
      pointer(content, 'pointerdown', 100, 200, 0);
      pointer(content, 'pointermove', 100, 100, 16);
    });
    expect(pane.scrollTop).toBe(600);
    resetGestureAxis();
  });

  it('leaves a downward pull on a pane already at its top to the sheet gesture', () => {
    render(<Harness enabled={true} />);
    const pane = screen.getByTestId('pane');
    const content = screen.getByTestId('content');
    pane.scrollTop = 0;
    act(() => {
      pointer(content, 'pointerdown', 100, 100, 0);
      pointer(content, 'pointermove', 100, 200, 16);
    });
    expect(pane.scrollTop).toBe(0);
  });
});
