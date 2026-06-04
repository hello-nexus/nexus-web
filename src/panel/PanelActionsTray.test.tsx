import { act, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PanelActionsTray } from './PanelActionsTray';

function Harness() {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  return (
    <div ref={surfaceRef} data-testid="surface" style={{ height: 800 }}>
      <PanelActionsTray
        open={false}
        onOpen={vi.fn()}
        onClose={vi.fn()}
        onAddWidget={vi.fn()}
        pairAvailable={false}
        surfaceRef={surfaceRef}
      />
    </div>
  );
}

describe('PanelActionsTray swipe-to-open', () => {
  // Regression: the reset effect used to depend on the whole `swipe` object
  // (new every render), so it re-ran on the drag's own re-render and — since
  // `open` stays false until commit — reset the live offset on every touchmove.
  // The tray would reveal, snap back to the bottom, and only animate up on
  // release. The drag must stay 'dragging' across the re-render it triggers.
  it('keeps tracking the finger during the pre-release drag (no reset)', () => {
    render(<Harness />);
    const surface = screen.getByTestId('surface');
    const tray = screen.getByLabelText('Panel actions');

    act(() => {
      // Start above the iOS home-indicator band (>28px from bottom of the
      // 768px jsdom viewport), then lift 50px up — past ENGAGE_DELTA (8),
      // vertical-dominant.
      dispatchTouch(surface, 'touchstart', 100, 700, 0);
      dispatchTouch(surface, 'touchmove', 100, 650, 16);
    });

    expect(tray).toHaveAttribute('data-state', 'dragging');
  });
});

function dispatchTouch(target: Element, type: string, clientX: number, clientY: number, timeStamp: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', {
    value: type === 'touchend' || type === 'touchcancel' ? [] : [{ clientX, clientY, target }],
  });
  Object.defineProperty(event, 'timeStamp', { value: timeStamp });
  target.dispatchEvent(event);
}
