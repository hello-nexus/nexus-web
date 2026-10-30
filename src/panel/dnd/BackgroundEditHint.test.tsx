import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BackgroundEditHint } from './BackgroundEditHint';

describe('BackgroundEditHint', () => {
  it('shows the shared edit notice labelled Edit background', () => {
    const { container } = render(<BackgroundEditHint onActivate={vi.fn()} />);
    expect(container.querySelector('[data-edit-hint-overlay]')?.textContent).toBe('panel.background.edit');
  });

  it('reports the click point', () => {
    const onActivate = vi.fn();
    render(<BackgroundEditHint onActivate={onActivate} />);
    fireEvent.click(screen.getByRole('button', { name: 'panel.background.edit' }), { clientX: 5, clientY: 9 });
    expect(onActivate).toHaveBeenCalledWith({ x: 5, y: 9 });
  });

  it('opens from the keyboard', () => {
    const onActivate = vi.fn();
    render(<BackgroundEditHint onActivate={onActivate} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    expect(onActivate).toHaveBeenCalledTimes(1);
  });
});
