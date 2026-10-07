import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { InfoTooltip } from './InfoTooltip';
import { TOOLTIP_OPEN_DELAY_MS } from '../tooltipDelay';

// Rendered outside I18nProvider, so t() falls back to raw keys.

// The sequence Chromium fires for one tap: the compatibility mousedown focuses the button before the click.
function tap(el: Element) {
  fireEvent.pointerDown(el, { pointerType: 'touch' });
  fireEvent.pointerUp(el, { pointerType: 'touch' });
  fireEvent.mouseDown(el);
  fireEvent.focus(el);
  fireEvent.mouseUp(el);
  fireEvent.click(el);
}

describe('InfoTooltip', () => {
  it('a tap opens the tooltip and a second tap closes it', () => {
    render(<InfoTooltip message="Hello" ariaLabel="Info" />);
    const btn = screen.getByRole('button', { name: 'Info' });
    tap(btn);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Hello');
    tap(btn);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('keyboard focus opens the tooltip', () => {
    render(<InfoTooltip message="Hello" ariaLabel="Info" />);
    fireEvent.focus(screen.getByRole('button', { name: 'Info' }));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('keyboard focus still opens the tooltip after a touch that was cancelled', () => {
    render(<InfoTooltip message="Hello" ariaLabel="Info" />);
    const btn = screen.getByRole('button', { name: 'Info' });
    fireEvent.pointerDown(btn, { pointerType: 'touch' });
    fireEvent.pointerCancel(btn, { pointerType: 'touch' });
    fireEvent.focus(btn);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('mouse hover opens the tooltip after its delay', () => {
    vi.useFakeTimers();
    try {
      render(<InfoTooltip message="Hello" ariaLabel="Info" />);
      fireEvent.pointerEnter(screen.getByRole('button', { name: 'Info' }), { pointerType: 'mouse' });
      act(() => { vi.advanceTimersByTime(TOOLTIP_OPEN_DELAY_MS); });
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('Escape closes an open tooltip', () => {
    render(<InfoTooltip message="Hello" ariaLabel="Info" />);
    fireEvent.focus(screen.getByRole('button', { name: 'Info' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
