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

  it('opens the given gap below its anchor, and the standard gap without one', () => {
    const rect = { top: 100, bottom: 100, left: 50, right: 50, width: 0, height: 0, x: 50, y: 100, toJSON: () => ({}) } as DOMRect;
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rect);
    const wide = (gap?: number) => {
      function H() {
        const anchor = useRef<HTMLDivElement>(null);
        return <div ref={anchor}><Popover open onClose={() => {}} anchorRef={anchor} portal gap={gap} ariaLabel="gap">body</Popover></div>;
      }
      const view = render(<H />);
      const top = screen.getByRole('dialog', { name: 'gap' }).style.top;
      view.unmount();
      return top;
    };
    expect(wide(40)).toBe('140px');
    expect(wide()).toBe('106px');
    spy.mockRestore();
  });

  it('flips above its anchor when the bounds, not the window, leave no room below', () => {
    const anchorRect = { top: 380, bottom: 380, left: 50, right: 50, width: 0, height: 0, x: 50, y: 380, toJSON: () => ({}) } as DOMRect;
    const boundsRect = { top: 0, bottom: 400, left: 0, right: 600, width: 600, height: 400, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.dataset.bounds ? boundsRect : anchorRect;
    });
    const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(100);
    function H() {
      const anchor = useRef<HTMLDivElement>(null);
      const bounds = useRef<HTMLDivElement>(null);
      return <div ref={bounds} data-bounds="1"><div ref={anchor}><Popover open onClose={() => {}} anchorRef={anchor} portal boundsRef={bounds} gap={40} ariaLabel="flip">body</Popover></div></div>;
    }
    render(<H />);
    expect(screen.getByRole('dialog', { name: 'flip' }).style.top).toBe('240px');
    height.mockRestore();
    spy.mockRestore();
  });
});
