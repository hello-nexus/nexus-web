import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BackgroundHoverLayer, BackgroundSplitHint } from './BackgroundEditHint';

describe('BackgroundHoverLayer', () => {
  it('shows one Edit background notice, lit only while the background is hovered', () => {
    const { container, rerender } = render(<BackgroundHoverLayer active={false} area={null} />);
    expect(container.querySelectorAll('[data-edit-hint-overlay]')).toHaveLength(1);
    expect(container.querySelector('[data-edit-hint-overlay]')?.textContent).toBe('panel.background.edit');
    expect(container.querySelector('[data-active]')).toBeNull();
    rerender(<BackgroundHoverLayer active area={null} />);
    expect(container.querySelector('[data-active="true"]')).not.toBeNull();
  });

  it('places the notice in the free area it is given', () => {
    const { container } = render(<BackgroundHoverLayer active area={{ left: 10, top: 20, width: 100, height: 50 }} />);
    const box = container.querySelector('[data-edit-hint-overlay] > div') as HTMLElement;
    expect(box.style.left).toBe('10px');
    expect(box.style.width).toBe('100px');
  });
});

describe('BackgroundHoverLayer scrim', () => {
  it('renders exactly one scrim, before the notice, and none per free rectangle', () => {
    const { container } = render(<BackgroundHoverLayer active area={{ left: 10, top: 20, width: 100, height: 50 }} />);
    const scrims = container.querySelectorAll('[data-bg-scrim]');
    expect(scrims).toHaveLength(1);
    const layer = container.firstElementChild as HTMLElement;
    expect(layer.children).toHaveLength(2);
    expect(layer.firstElementChild).toBe(scrims[0]);
    expect((scrims[0] as HTMLElement).getAttribute('style')).toBeNull();
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
