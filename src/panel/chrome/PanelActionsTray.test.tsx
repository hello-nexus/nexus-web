import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PanelActionsTray } from './PanelActionsTray';
import { resetGestureAxis } from '../engine/gestureAxisLock';
import type { PanelSurface } from '../types';

function Harness({ surface = 'phone' }: { surface?: PanelSurface }) {
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
        surface={surface}
      />
    </div>
  );
}

describe('PanelActionsTray Sentry row', () => {
  function renderTray(onSentry: (() => void) | undefined, onClose = vi.fn()) {
    render(
      <PanelActionsTray
        open
        onOpen={vi.fn()}
        onClose={onClose}
        onAddWidget={vi.fn()}
        pairAvailable={false}
        surfaceRef={{ current: null }}
        surface="phone"
        machineName="Desk"
        remotePaired
        onSentry={onSentry}
      />,
    );
    return onClose;
  }

  it('hides the row when Sentry is unsupported', () => {
    renderTray(undefined);
    expect(screen.queryByRole('button', { name: 'sentry.card.title' })).toBeNull();
  });

  it('opens Sentry and closes the tray, above the connected-to row', () => {
    const onSentry = vi.fn();
    const onClose = renderTray(onSentry);
    const row = screen.getByRole('button', { name: 'sentry.card.title' });
    const connected = screen.getByText('panel.connectedTo');
    expect(row.compareDocumentPosition(connected) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(row);
    expect(onSentry).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

describe('PanelActionsTray swipe-to-open', () => {
  beforeEach(() => resetGestureAxis());

  // Regression: the reset effect used to depend on the whole `swipe` object
  // (new every render), so it re-ran on the drag's own re-render and - since
  // `open` stays false until commit - reset the live offset on every touchmove.
  // The tray would reveal, snap back to the bottom, and only animate up on
  // release. The drag must stay 'dragging' across the re-render it triggers.
  it('keeps tracking the finger during the pre-release drag (no reset)', () => {
    render(<Harness />);
    const surface = screen.getByTestId('surface');
    const tray = screen.getByLabelText('panel.actions.label');

    act(() => {
      // Above the iOS home-indicator band (clear of the bottom-edge ignore
      // zone), lift straight up past the engage dead zone, clearly
      // vertical-dominant, so the tray engages.
      dispatchTouch(surface, 'touchstart', 100, 700, 0);
      dispatchTouch(surface, 'touchmove', 100, 650, 16);
    });

    expect(tray).toHaveAttribute('data-state', 'dragging');
  });

  // A mostly-horizontal swipe (page change) must not pop the tray, even once
  // it has lifted past the vertical engage distance.
  it('ignores a horizontal-dominant swipe', () => {
    render(<Harness />);
    const surface = screen.getByTestId('surface');
    const tray = screen.getByLabelText('panel.actions.label');

    act(() => {
      // Mostly horizontal (200px across, little vertical lift): not
      // vertical-dominant, so the tray leaves it to the pager.
      dispatchTouch(surface, 'touchstart', 100, 700, 0);
      dispatchTouch(surface, 'touchmove', 300, 680, 16);
    });

    expect(tray).toHaveAttribute('data-state', 'closed');
  });

  // A finger sliding in from below the screen first lands on the bottom edge.
  it('opens from the very bottom edge on a kiosk panel', () => {
    render(<Harness surface="y70" />);
    const surface = screen.getByTestId('surface');
    const tray = screen.getByLabelText('panel.actions.label');

    act(() => {
      dispatchTouch(surface, 'touchstart', 100, window.innerHeight - 4, 0);
      dispatchTouch(surface, 'touchmove', 100, window.innerHeight - 300, 16);
    });

    expect(tray).toHaveAttribute('data-state', 'dragging');
  });

  // The phone's system home-indicator band keeps its bottom edge.
  it('leaves the bottom edge to the system on a phone', () => {
    render(<Harness surface="phone" />);
    const surface = screen.getByTestId('surface');
    const tray = screen.getByLabelText('panel.actions.label');

    act(() => {
      dispatchTouch(surface, 'touchstart', 100, window.innerHeight - 4, 0);
      dispatchTouch(surface, 'touchmove', 100, window.innerHeight - 300, 16);
    });

    expect(tray).toHaveAttribute('data-state', 'closed');
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
