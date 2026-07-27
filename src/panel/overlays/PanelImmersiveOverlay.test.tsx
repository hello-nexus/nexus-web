import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PanelImmersiveOverlay } from './PanelImmersiveOverlay';

// Both the top-centre swipe hint and the simulator X close the overlay, so they
// share the close label; the count is what distinguishes the two states.
const CLOSE = 'panel.immersive.close';

describe('PanelImmersiveOverlay', () => {
  it('renders only the swipe hint by default (device)', () => {
    render(
      <PanelImmersiveOverlay open onExit={() => {}}>
        <div>content</div>
      </PanelImmersiveOverlay>,
    );
    expect(screen.getAllByLabelText(CLOSE)).toHaveLength(1);
  });

  it('adds an explicit close button when showCloseButton is set (simulator)', () => {
    render(
      <PanelImmersiveOverlay open onExit={() => {}} showCloseButton>
        <div>content</div>
      </PanelImmersiveOverlay>,
    );
    expect(screen.getAllByLabelText(CLOSE)).toHaveLength(2);
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

  it('close button runs the exit transition and then calls onExit', () => {
    vi.useFakeTimers();
    try {
      const onExit = vi.fn();
      render(
        <PanelImmersiveOverlay open onExit={onExit} showCloseButton>
          <div>content</div>
        </PanelImmersiveOverlay>,
      );
      // The X is the last close-labelled control; the swipe hint precedes it.
      const buttons = screen.getAllByLabelText(CLOSE);
      fireEvent.click(buttons[buttons.length - 1]);
      expect(onExit).not.toHaveBeenCalled();
      act(() => { vi.runAllTimers(); });
      expect(onExit).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
