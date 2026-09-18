import { act, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { usePanelSheetSwipe } from './usePanelSheetSwipe';
import { TouchViaPointerContext } from './touchViaPointer';

function SheetSwipeHarness() {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const swipe = usePanelSheetSwipe({
    enabled: true,
    sheetRef,
    onDismiss: vi.fn(),
  });

  return (
    <div
      ref={node => {
        sheetRef.current = node;
        if (node) {
          node.getBoundingClientRect = () => ({
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            right: window.innerWidth,
            bottom: 400,
            width: window.innerWidth,
            height: 400,
            toJSON: () => {},
          });
        }
      }}
      data-testid="sheet"
      data-state={swipe.state}
    >
      <input data-testid="range" type="range" />
      <div data-testid="blank">blank</div>
    </div>
  );
}

function dispatchPointer(target: Element, type: string, x: number, y: number, timeStamp: number, buttons: number) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, buttons, button: 0 });
  Object.defineProperties(event, {
    pointerType: { value: 'mouse' },
    isPrimary: { value: true },
    pointerId: { value: 1 },
    timeStamp: { value: timeStamp },
  });
  target.dispatchEvent(event);
}

describe('usePanelSheetSwipe', () => {
  it('ignores a mouse drag without the touch-via-pointer flag', () => {
    render(<SheetSwipeHarness />);
    const sheet = screen.getByTestId('sheet');
    const blank = screen.getByTestId('blank');

    act(() => {
      dispatchPointer(blank, 'pointerdown', 120, 120, 0, 1);
      dispatchPointer(blank, 'pointermove', 120, 200, 16, 1);
    });

    expect(sheet).toHaveAttribute('data-state', 'idle');
  });

  it('engages a downward mouse drag under the touch-via-pointer flag', () => {
    render(
      <TouchViaPointerContext.Provider value={true}>
        <SheetSwipeHarness />
      </TouchViaPointerContext.Provider>,
    );
    const sheet = screen.getByTestId('sheet');
    const blank = screen.getByTestId('blank');

    act(() => {
      dispatchPointer(blank, 'pointerdown', 120, 120, 0, 1);
      dispatchPointer(blank, 'pointermove', 120, 200, 16, 1);
    });

    expect(sheet).toHaveAttribute('data-state', 'dragging');
  });

  it('does not engage swipe-dismiss gestures that start on range sliders', () => {
    render(<SheetSwipeHarness />);

    const sheet = screen.getByTestId('sheet');
    const range = screen.getByTestId('range');

    act(() => {
      dispatchTouch(range, 'touchstart', 120, 120, 0);
      dispatchTouch(range, 'touchmove', 120, 160, 16);
    });

    expect(sheet).toHaveAttribute('data-state', 'idle');
  });

  it('still engages downward swipe gestures from non-control sheet content', () => {
    render(<SheetSwipeHarness />);

    const sheet = screen.getByTestId('sheet');
    const blank = screen.getByTestId('blank');

    act(() => {
      dispatchTouch(blank, 'touchstart', 120, 120, 0);
      dispatchTouch(blank, 'touchmove', 120, 160, 16);
    });

    expect(sheet).toHaveAttribute('data-state', 'dragging');
  });
});

function dispatchTouch(target: Element, type: string, clientX: number, clientY: number, timeStamp: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', {
    value: type === 'touchend' || type === 'touchcancel'
      ? []
      : [{ clientX, clientY, target }],
  });
  Object.defineProperty(event, 'timeStamp', { value: timeStamp });
  target.dispatchEvent(event);
}
