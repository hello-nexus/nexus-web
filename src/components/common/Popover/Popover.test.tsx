import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { Popover } from './Popover';

function Host({ portal, onClose = () => {} }: { portal?: boolean; onClose?: () => void }) {
  const anchor = useRef<HTMLDivElement>(null);
  return (
    <div data-testid="scroller" style={{ overflow: 'auto' }}>
      <div ref={anchor}>
        <Popover open onClose={onClose} anchorRef={anchor} portal={portal} ariaLabel="picker">body</Popover>
      </div>
    </div>
  );
}

describe('Popover', () => {
  it('renders inside its anchor by default', () => {
    render(<Host />);
    expect(screen.getByTestId('scroller').contains(screen.getByRole('dialog', { name: 'picker' }))).toBe(true);
  });

  it('escapes a clipping ancestor when portaled', () => {
    render(<Host portal />);
    const pop = screen.getByRole('dialog', { name: 'picker' });
    expect(screen.getByTestId('scroller').contains(pop)).toBe(false);
    expect(pop.parentElement).toBe(document.body);
    expect(pop.style.visibility).toBe('');
  });

  it('closes when a scrolling ancestor carries its anchor away', () => {
    const onClose = vi.fn();
    render(<Host portal onClose={onClose} />);
    fireEvent.scroll(screen.getByTestId('scroller'));
    expect(onClose).toHaveBeenCalled();
  });
});
