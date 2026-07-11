import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExperimentalBadge } from './ExperimentalBadge';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('ExperimentalBadge', () => {
  it('renders the badge label', () => {
    render(<ExperimentalBadge />);
    expect(screen.getByText('devices.experimental.badge')).toBeInTheDocument();
  });

  it('exposes the caveat to assistive tech via an aria-label', () => {
    render(<ExperimentalBadge />);
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'devices.experimental.tooltip.title. devices.experimental.tooltip.body',
    );
  });

  it('reveals the experimental-support tooltip', () => {
    render(<ExperimentalBadge />);
    // Focus opens the HoverTooltip immediately (no rest delay).
    fireEvent.focus(screen.getByText('devices.experimental.badge').parentElement as HTMLElement);
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('devices.experimental.tooltip.title');
    expect(tooltip).toHaveTextContent('devices.experimental.tooltip.body');
  });
});
