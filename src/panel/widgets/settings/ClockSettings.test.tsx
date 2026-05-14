import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PanelWidget } from '../../types';
import { ClockSettings } from './ClockSettings';

function clockWidget(): PanelWidget {
  return {
    id: 'clock-1',
    type: 'clock',
    size: '4x2',
    col: 0,
    row: 0,
    config: {
      design: 'analog',
    },
  };
}

describe('ClockSettings', () => {
  it('renders clock designs as icon label buttons', () => {
    render(<ClockSettings widget={clockWidget()} onUpdate={vi.fn()} onResize={vi.fn()} />);

    const labels = ['Digital', 'Analog', 'Split Flap', 'Rolling', 'LED', 'Dots', 'Matrix'];
    expect(screen.getAllByRole('button')).toHaveLength(labels.length);

    for (const label of labels) {
      expect(screen.getByRole('button', { name: label }).querySelector('svg')).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Analog' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Digital' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('updates the selected clock design', () => {
    const onUpdate = vi.fn();
    render(<ClockSettings widget={clockWidget()} onUpdate={onUpdate} onResize={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Split Flap' }));

    expect(onUpdate).toHaveBeenCalledWith({ design: 'splitflap' });
  });
});
