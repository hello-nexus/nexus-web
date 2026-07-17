// Exit-path regression coverage: PanelApp holds `open` true for the whole
// session (close = unmount via onExit), so every user-initiated exit runs
// while open is still true. The mount effect once keyed its cancel-pending-
// exit branch on the CURRENT open value, which pulled every exit (pill tap,
// swipe-dismiss, ESC) straight back to 'mounted' - the overlay could not be
// closed at all.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { PanelImmersiveOverlay } from './PanelImmersiveOverlay';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderOverlay(open = true) {
  const onExit = vi.fn();
  const utils = render(
    <PanelImmersiveOverlay open={open} onExit={onExit}>
      <div>content</div>
    </PanelImmersiveOverlay>,
  );
  return { onExit, ...utils };
}

describe('PanelImmersiveOverlay exit paths (open stays true)', () => {
  it('exit-hint click unmounts and fires onExit', () => {
    vi.useFakeTimers();
    const { onExit, container } = renderOverlay();
    // DOM order: [0] top-center grabber pill, [1] corner X.
    fireEvent.click(container.querySelectorAll('button')[0]);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('corner X click unmounts and fires onExit', () => {
    vi.useFakeTimers();
    const { onExit, container } = renderOverlay();
    fireEvent.click(container.querySelectorAll('button')[1]);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('Escape unmounts and fires onExit', () => {
    vi.useFakeTimers();
    const { onExit, container } = renderOverlay();
    fireEvent.keyDown(document, { key: 'Escape' });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('open crossing back into true cancels a host-driven exit', () => {
    vi.useFakeTimers();
    const onExit = vi.fn();
    const { container, rerender } = render(
      <PanelImmersiveOverlay open onExit={onExit}>
        <div>content</div>
      </PanelImmersiveOverlay>,
    );
    // Host closes, then re-opens before the exit animation completes.
    rerender(
      <PanelImmersiveOverlay open={false} onExit={onExit}>
        <div>content</div>
      </PanelImmersiveOverlay>,
    );
    rerender(
      <PanelImmersiveOverlay open onExit={onExit}>
        <div>content</div>
      </PanelImmersiveOverlay>,
    );
    act(() => { vi.advanceTimersByTime(1000); });
    expect(container.querySelector('[role="dialog"]')?.getAttribute('data-state')).toBe('open');
    expect(onExit).not.toHaveBeenCalled();
  });
});
