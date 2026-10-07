import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { InfoTooltip } from './InfoTooltip';

// Rendered outside I18nProvider, so t() falls back to raw keys.

// The sequence a browser fires for one tap or click: the press focuses the button before the click.
function tap(el: Element) {
  fireEvent.pointerDown(el, { pointerType: 'touch' });
  fireEvent.mouseDown(el);
  fireEvent.focus(el);
  fireEvent.pointerUp(el, { pointerType: 'touch' });
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

  it('mouse hover opens the tooltip after its delay', async () => {
    render(<InfoTooltip message="Hello" ariaLabel="Info" />);
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Info' }), { pointerType: 'mouse' });
    await act(async () => { await new Promise(r => setTimeout(r, 700)); });
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('Escape closes an open tooltip', () => {
    render(<InfoTooltip message="Hello" ariaLabel="Info" />);
    fireEvent.focus(screen.getByRole('button', { name: 'Info' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
