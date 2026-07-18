import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from './Badge';

describe('Badge', () => {
  it('renders the label', () => {
    render(<Badge label="Live" />);
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('leaves the min-width var unset by default', () => {
    render(<Badge label="Live" />);
    expect(screen.getByText('Live').style.getPropertyValue('--badge-min-width')).toBe('');
  });

  it('sets a fixed min-width var when minWidth is given, independent of label length', () => {
    const { rerender } = render(<Badge label="9%" minWidth="4ch" />);
    expect(screen.getByText('9%').style.getPropertyValue('--badge-min-width')).toBe('4ch');

    rerender(<Badge label="100%" minWidth="4ch" />);
    expect(screen.getByText('100%').style.getPropertyValue('--badge-min-width')).toBe('4ch');
  });

  it('renders the icon before the label by default', () => {
    render(<Badge label="Live" icon={<span data-testid="icon" />} />);
    const icon = screen.getByTestId('icon');
    expect(icon.nextSibling?.textContent).toBe('Live');
  });

  it('renders the icon after the label when iconPosition is "end"', () => {
    render(<Badge label="Live" icon={<span data-testid="icon" />} iconPosition="end" />);
    const icon = screen.getByTestId('icon');
    expect(icon.previousSibling?.textContent).toBe('Live');
  });
});
