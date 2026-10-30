import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BackgroundHoverLayer, BackgroundSplitHint } from './BackgroundEditHint';

describe('BackgroundHoverLayer', () => {
  it('shows one Edit background notice, lit only while the background is hovered', () => {
    const { container, rerender } = render(<BackgroundHoverLayer active={false} area={null} pieces={[]} />);
    expect(container.querySelectorAll('[data-edit-hint-overlay]')).toHaveLength(1);
    expect(container.querySelector('[data-edit-hint-overlay]')?.textContent).toBe('panel.background.edit');
    expect(container.querySelector('[data-active]')).toBeNull();
    rerender(<BackgroundHoverLayer active area={null} pieces={[]} />);
    expect(container.querySelector('[data-active="true"]')).not.toBeNull();
  });

  it('places the notice in the free area it is given', () => {
    const { container } = render(<BackgroundHoverLayer active area={{ left: 10, top: 20, width: 100, height: 50 }} pieces={[]} />);
    const box = container.querySelector('[data-edit-hint-overlay] > div') as HTMLElement;
    expect(box.style.left).toBe('10px');
    expect(box.style.width).toBe('100px');
  });
});

describe('BackgroundHoverLayer scrim', () => {
  it('paints one scrim piece per free rectangle and none over a widget', () => {
    const pieces = [{ left: 0, top: 0, width: 100, height: 50 }, { left: 0, top: 50, width: 40, height: 50 }];
    const { container } = render(<BackgroundHoverLayer active area={null} pieces={pieces} />);
    const drawn = Array.from(container.querySelectorAll<HTMLElement>('[data-active] > div:not([data-edit-hint-overlay])'));
    expect(drawn.map(d => [d.style.left, d.style.top, d.style.width, d.style.height])).toEqual([['0px', '0px', '100px', '50px'], ['0px', '50px', '40px', '50px']]);
  });
});

describe('BackgroundSplitHint', () => {
  it('shows both notices on a widget canvas and opens the menu from the background half', () => {
    const onActivate = vi.fn();
    const { container } = render(<BackgroundSplitHint orientation="side" round={false} widgetHalf onActivate={onActivate} />);
    expect(Array.from(container.querySelectorAll('[data-edit-hint-overlay]')).map(e => e.textContent)).toEqual(['panel.widget.editWidget', 'panel.background.edit']);
    expect(container.querySelector('[data-orientation="side"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'panel.background.edit' }), { clientX: 5, clientY: 9 });
    expect(onActivate).toHaveBeenCalledWith({ x: 5, y: 9 });
  });

  it('is one whole-canvas Edit background on an empty slot', () => {
    const { container } = render(<BackgroundSplitHint orientation="stacked" round widgetHalf={false} onActivate={vi.fn()} />);
    expect(Array.from(container.querySelectorAll('[data-edit-hint-overlay]')).map(e => e.textContent)).toEqual(['panel.background.edit']);
    expect(container.querySelector('[data-round="true"]')).not.toBeNull();
  });

  it('opens from the keyboard', () => {
    const onActivate = vi.fn();
    render(<BackgroundSplitHint orientation="stacked" round={false} widgetHalf onActivate={onActivate} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    expect(onActivate).toHaveBeenCalledTimes(1);
  });
});
