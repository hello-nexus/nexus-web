import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CONFIRM_WINDOW_MS, NOTCH_FADE_DELAY_MS, PanelImmersiveOverlay } from './PanelImmersiveOverlay';
import { pushModalStackEntry, removeModalStackEntry } from '../../components/common/Overlay/modalStack';
import styles from './PanelImmersiveOverlay.module.scss';

// The top-centre swipe hint is the only close control; asserting the count
// keeps a second one from reappearing.
const CLOSE = 'panel.immersive.close';

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

describe('PanelImmersiveOverlay', () => {
  it('renders the swipe hint as the only close control', () => {
    render(
      <PanelImmersiveOverlay open onExit={() => {}}>
        <div>content</div>
      </PanelImmersiveOverlay>,
    );
    expect(screen.getAllByLabelText(CLOSE)).toHaveLength(1);
  });

  // Pairs with PanelImmersiveOverlay.touchAction.test.ts: that one proves the
  // stylesheet withholds pinch-zoom, this one proves the class carrying it
  // still lands on the element. Dropping styles.overlay from the className
  // restores the zoom bug with the stylesheet untouched.
  it('applies the overlay class that withholds pinch-zoom', () => {
    render(
      <PanelImmersiveOverlay open onExit={() => {}}>
        <div>content</div>
      </PanelImmersiveOverlay>,
    );
    expect(screen.getByRole('dialog').className).toContain(styles.overlay);
  });

  it('reports the close as it starts, a slide before onExit', () => {
    vi.useFakeTimers();
    try {
      const onExitStart = vi.fn();
      const onExit = vi.fn();
      render(
        <PanelImmersiveOverlay open onExit={onExit} onExitStart={onExitStart}>
          <div>content</div>
        </PanelImmersiveOverlay>,
      );
      fireEvent.click(screen.getByLabelText(CLOSE));
      expect(onExitStart).toHaveBeenCalledTimes(1);
      expect(onExit).not.toHaveBeenCalled();
      act(() => { vi.advanceTimersByTime(500); });
      expect(onExit).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks the overlay see-through only when asked', () => {
    const solid = render(
      <PanelImmersiveOverlay open onExit={() => {}}>
        <div>content</div>
      </PanelImmersiveOverlay>,
    );
    expect(screen.getByRole('dialog').getAttribute('data-see-through')).toBeNull();
    solid.unmount();

    render(
      <PanelImmersiveOverlay open onExit={() => {}} seeThrough>
        <div>content</div>
      </PanelImmersiveOverlay>,
    );
    expect(screen.getByRole('dialog').getAttribute('data-see-through')).toBe('true');
  });

  // A mouse cannot drag the hint back into view the way touch does, so without
  // the pointer reveal a faded hint leaves a mouse-driven surface no visible exit.
  it('re-reveals the faded hint on mouse movement', () => {
    vi.useFakeTimers();
    try {
      render(
        <PanelImmersiveOverlay open onExit={() => {}}>
          <div>content</div>
        </PanelImmersiveOverlay>,
      );
      const hint = screen.getByLabelText(CLOSE);
      act(() => { vi.advanceTimersByTime(NOTCH_FADE_DELAY_MS + 100); });
      expect(hint.getAttribute('data-revealed')).toBe('false');

      fireEvent.pointerMove(hint.closest('[role="dialog"]')!, { pointerType: 'mouse' });
      expect(hint.getAttribute('data-revealed')).toBe('true');

      // A touch pointer must not: touch owns visibility through the drag.
      act(() => { vi.advanceTimersByTime(NOTCH_FADE_DELAY_MS + 100); });
      fireEvent.pointerMove(hint.closest('[role="dialog"]')!, { pointerType: 'touch' });
      expect(hint.getAttribute('data-revealed')).toBe('false');
    } finally {
      vi.useRealTimers();
    }
  });

  // The host keeps `open` true for the overlay's whole life, so an exit must
  // complete without `open` ever going false.
  it('swipe hint exits while open stays true', () => {
    vi.useFakeTimers();
    try {
      const onExit = vi.fn();
      render(
        <PanelImmersiveOverlay open onExit={onExit}>
          <div>content</div>
        </PanelImmersiveOverlay>,
      );
      fireEvent.click(screen.getByLabelText(CLOSE));
      act(() => { vi.runAllTimers(); });
      expect(onExit).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('runs the exit transition before calling onExit', () => {
    vi.useFakeTimers();
    try {
      const onExit = vi.fn();
      render(
        <PanelImmersiveOverlay open onExit={onExit}>
          <div>content</div>
        </PanelImmersiveOverlay>,
      );
      fireEvent.click(screen.getByLabelText(CLOSE));
      expect(onExit).not.toHaveBeenCalled();
      act(() => { vi.runAllTimers(); });
      expect(onExit).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('Escape exits the overlay', () => {
    vi.useFakeTimers();
    try {
      const onExit = vi.fn();
      render(
        <PanelImmersiveOverlay open onExit={onExit}>
          <div>content</div>
        </PanelImmersiveOverlay>,
      );
      fireEvent.keyDown(document, { key: 'Escape' });
      act(() => { vi.runAllTimers(); });
      expect(onExit).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  // The overlay registers with the shared modal stack (useModalA11y), which
  // dispatches Escape to only the topmost entry - so a modal raised above it
  // (e.g. the widget editor sheet) must consume the key instead.
  it('Escape does not exit the overlay while a modal above it is open', () => {
    vi.useFakeTimers();
    try {
      const onExit = vi.fn();
      render(
        <PanelImmersiveOverlay open onExit={onExit}>
          <div>content</div>
        </PanelImmersiveOverlay>,
      );
      const aboveOnEscape = vi.fn(() => true);
      pushModalStackEntry({
        id: 'immersive-escape-test-above',
        containerRef: { current: document.body },
        trapFocus: false,
        onEscape: aboveOnEscape,
        onEnter: () => false,
      });
      try {
        fireEvent.keyDown(document, { key: 'Escape' });
        act(() => { vi.runAllTimers(); });
        expect(aboveOnEscape).toHaveBeenCalledTimes(1);
        expect(onExit).not.toHaveBeenCalled();
      } finally {
        removeModalStackEntry('immersive-escape-test-above');
      }
    } finally {
      vi.useRealTimers();
    }
  });

  describe('auto-fading close notch', () => {
    it('is revealed on open, then fades after the idle delay', () => {
      vi.useFakeTimers();
      try {
        render(
          <PanelImmersiveOverlay open onExit={() => {}}>
            <div>content</div>
          </PanelImmersiveOverlay>,
        );
        const notch = screen.getByLabelText(CLOSE);
        expect(notch).toHaveAttribute('data-revealed', 'true');
        act(() => { vi.advanceTimersByTime(NOTCH_FADE_DELAY_MS); });
        expect(notch).toHaveAttribute('data-revealed', 'false');
      } finally {
        vi.useRealTimers();
      }
    });

    it('a tap while faded reveals it again without closing the overlay', () => {
      vi.useFakeTimers();
      try {
        const onExit = vi.fn();
        render(
          <PanelImmersiveOverlay open onExit={onExit}>
            <div>content</div>
          </PanelImmersiveOverlay>,
        );
        const notch = screen.getByLabelText(CLOSE);
        act(() => { vi.advanceTimersByTime(NOTCH_FADE_DELAY_MS); });
        expect(notch).toHaveAttribute('data-revealed', 'false');

        fireEvent.click(notch);
        expect(onExit).not.toHaveBeenCalled();
        expect(notch).toHaveAttribute('data-revealed', 'true');
      } finally {
        vi.useRealTimers();
      }
    });

    it('a tap while visible closes the overlay, including a second tap right after a reveal', () => {
      vi.useFakeTimers();
      try {
        const onExit = vi.fn();
        render(
          <PanelImmersiveOverlay open onExit={onExit}>
            <div>content</div>
          </PanelImmersiveOverlay>,
        );
        const notch = screen.getByLabelText(CLOSE);
        act(() => { vi.advanceTimersByTime(NOTCH_FADE_DELAY_MS); });

        fireEvent.click(notch);
        expect(onExit).not.toHaveBeenCalled();

        fireEvent.click(notch);
        act(() => { vi.runAllTimers(); });
        expect(onExit).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('a reveal restarts the idle timer, fading again only after a full new delay', () => {
      vi.useFakeTimers();
      try {
        render(
          <PanelImmersiveOverlay open onExit={() => {}}>
            <div>content</div>
          </PanelImmersiveOverlay>,
        );
        const notch = screen.getByLabelText(CLOSE);
        act(() => { vi.advanceTimersByTime(NOTCH_FADE_DELAY_MS); });
        fireEvent.click(notch);
        expect(notch).toHaveAttribute('data-revealed', 'true');

        act(() => { vi.advanceTimersByTime(NOTCH_FADE_DELAY_MS - 1); });
        expect(notch).toHaveAttribute('data-revealed', 'true');

        act(() => { vi.advanceTimersByTime(1); });
        expect(notch).toHaveAttribute('data-revealed', 'false');
      } finally {
        vi.useRealTimers();
      }
    });

    it('reveals the notch as a swipe-dismiss drag begins, and the swipe still dismisses on the first gesture', () => {
      vi.useFakeTimers();
      try {
        const onExit = vi.fn();
        render(
          <PanelImmersiveOverlay open onExit={onExit}>
            <div data-testid="body">content</div>
          </PanelImmersiveOverlay>,
        );
        const notch = screen.getByLabelText(CLOSE);
        act(() => { vi.advanceTimersByTime(NOTCH_FADE_DELAY_MS); });
        expect(notch).toHaveAttribute('data-revealed', 'false');

        const dialog = screen.getByRole('dialog');
        dialog.getBoundingClientRect = () => ({
          x: 0, y: 0, top: 0, left: 0, right: window.innerWidth, bottom: 800,
          width: window.innerWidth, height: 800, toJSON: () => {},
        });
        const body = screen.getByTestId('body');

        act(() => {
          dispatchTouch(body, 'touchstart', 100, 100, 0);
          dispatchTouch(body, 'touchmove', 100, 140, 16);
        });
        expect(notch).toHaveAttribute('data-revealed', 'true');

        act(() => { dispatchTouch(body, 'touchend', 100, 140, 32); });
        expect(onExit).not.toHaveBeenCalled();
        act(() => { vi.runAllTimers(); });
        expect(onExit).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('cleans up the fade timer on unmount, leaving no pending timers', () => {
      vi.useFakeTimers();
      try {
        const { unmount } = render(
          <PanelImmersiveOverlay open onExit={() => {}}>
            <div>content</div>
          </PanelImmersiveOverlay>,
        );
        unmount();
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('confirmClose (opt-in two-step swipe)', () => {
    function swipeDown(body: HTMLElement) {
      act(() => {
        dispatchTouch(body, 'touchstart', 100, 100, 0);
        dispatchTouch(body, 'touchmove', 100, 140, 16);
      });
      act(() => { dispatchTouch(body, 'touchend', 100, 140, 32); });
    }

    // A refused dismiss's snap-back settle timer re-arms the fade timer from
    // an effect, which only registers at an act() boundary - so draining it
    // needs two separate advances, each alone already longer than the armed
    // window, rather than one continuous advance or runAllTimers.
    function runOutTheFade() {
      act(() => { vi.advanceTimersByTime(CONFIRM_WINDOW_MS); });
      act(() => { vi.advanceTimersByTime(CONFIRM_WINDOW_MS); });
    }

    it('a swipe while the notch is faded reveals it and does not close', () => {
      vi.useFakeTimers();
      try {
        const onExit = vi.fn();
        render(
          <PanelImmersiveOverlay open onExit={onExit} confirmClose>
            <div data-testid="body">content</div>
          </PanelImmersiveOverlay>,
        );
        const notch = screen.getByLabelText(CLOSE);
        act(() => { vi.advanceTimersByTime(NOTCH_FADE_DELAY_MS); });
        expect(notch).toHaveAttribute('data-revealed', 'false');

        const dialog = screen.getByRole('dialog');
        dialog.getBoundingClientRect = () => ({
          x: 0, y: 0, top: 0, left: 0, right: window.innerWidth, bottom: 800,
          width: window.innerWidth, height: 800, toJSON: () => {},
        });
        swipeDown(screen.getByTestId('body'));

        expect(onExit).not.toHaveBeenCalled();
        expect(notch).toHaveAttribute('data-revealed', 'true');

        // The hook refused the dismiss, so the sheet must snap back to rest
        // through its normal settle path rather than staying glided off-screen.
        act(() => { vi.runAllTimers(); });
        expect(dialog).not.toHaveAttribute('data-drag');
        expect(dialog.style.transform).toBe('');
      } finally {
        vi.useRealTimers();
      }
    });

    it('a first swipe only reveals even while the notch still shows from open, and a second one closes', () => {
      vi.useFakeTimers();
      try {
        const onExit = vi.fn();
        render(
          <PanelImmersiveOverlay open onExit={onExit} confirmClose>
            <div data-testid="body">content</div>
          </PanelImmersiveOverlay>,
        );
        const notch = screen.getByLabelText(CLOSE);
        expect(notch).toHaveAttribute('data-revealed', 'true');
        const dialog = screen.getByRole('dialog');
        dialog.getBoundingClientRect = () => ({
          x: 0, y: 0, top: 0, left: 0, right: window.innerWidth, bottom: 800,
          width: window.innerWidth, height: 800, toJSON: () => {},
        });
        swipeDown(screen.getByTestId('body'));
        act(() => { vi.advanceTimersByTime(NOTCH_FADE_DELAY_MS); });
        expect(onExit).not.toHaveBeenCalled();

        // Still inside the armed window, past the plain fade delay.
        swipeDown(screen.getByTestId('body'));
        act(() => { vi.runAllTimers(); });
        expect(onExit).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('reveals again on a further swipe once the reveal fades back out', () => {
      vi.useFakeTimers();
      try {
        const onExit = vi.fn();
        render(
          <PanelImmersiveOverlay open onExit={onExit} confirmClose>
            <div data-testid="body">content</div>
          </PanelImmersiveOverlay>,
        );
        const notch = screen.getByLabelText(CLOSE);
        const dialog = screen.getByRole('dialog');
        dialog.getBoundingClientRect = () => ({
          x: 0, y: 0, top: 0, left: 0, right: window.innerWidth, bottom: 800,
          width: window.innerWidth, height: 800, toJSON: () => {},
        });
        act(() => { vi.advanceTimersByTime(NOTCH_FADE_DELAY_MS); });
        expect(notch).toHaveAttribute('data-revealed', 'false');

        swipeDown(screen.getByTestId('body'));
        expect(onExit).not.toHaveBeenCalled();
        expect(notch).toHaveAttribute('data-revealed', 'true');

        runOutTheFade();
        expect(notch).toHaveAttribute('data-revealed', 'false');

        swipeDown(screen.getByTestId('body'));
        expect(onExit).not.toHaveBeenCalled();
        expect(notch).toHaveAttribute('data-revealed', 'true');
      } finally {
        vi.useRealTimers();
      }
    });

    it('a hint tap under confirmClose also reveals first, and closes only once armed', () => {
      vi.useFakeTimers();
      try {
        const onExit = vi.fn();
        render(
          <PanelImmersiveOverlay open onExit={onExit} confirmClose>
            <div data-testid="body">content</div>
          </PanelImmersiveOverlay>,
        );
        const notch = screen.getByLabelText(CLOSE);
        // Visible from open, yet a tap only arms the close.
        fireEvent.click(notch);
        act(() => { vi.runOnlyPendingTimers(); });
        expect(onExit).not.toHaveBeenCalled();

        fireEvent.click(notch);
        fireEvent.click(notch);
        act(() => { vi.runAllTimers(); });
        expect(onExit).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('without confirmClose, a swipe closes on the first gesture regardless of notch visibility', () => {
      vi.useFakeTimers();
      try {
        const onExit = vi.fn();
        render(
          <PanelImmersiveOverlay open onExit={onExit}>
            <div data-testid="body">content</div>
          </PanelImmersiveOverlay>,
        );
        const dialog = screen.getByRole('dialog');
        dialog.getBoundingClientRect = () => ({
          x: 0, y: 0, top: 0, left: 0, right: window.innerWidth, bottom: 800,
          width: window.innerWidth, height: 800, toJSON: () => {},
        });
        act(() => { vi.advanceTimersByTime(NOTCH_FADE_DELAY_MS); });
        swipeDown(screen.getByTestId('body'));

        act(() => { vi.runAllTimers(); });
        expect(onExit).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
