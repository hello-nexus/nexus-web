import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Badge } from './Badge';
import styles from './Badge.module.scss';

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

  it('renders in caps by default and keeps its own case with uppercase={false}', () => {
    const { rerender } = render(<Badge label="Live" />);
    expect(screen.getByText('Live').className).toContain(styles.uppercase);

    rerender(<Badge label="Live" uppercase={false} />);
    expect(screen.getByText('Live').className).not.toContain(styles.uppercase);
  });

  it('is a button with onClick, and the press and Enter stay off an enclosing clickable row', () => {
    const onClick = vi.fn();
    const onRowClick = vi.fn();
    const onRowKey = vi.fn();
    render(
      <div onClick={onRowClick} onKeyDown={onRowKey}>
        <Badge label="Not responding" onClick={onClick} />
      </div>,
    );
    const button = screen.getByRole('button', { name: 'Not responding' });
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
    expect(onRowKey).not.toHaveBeenCalled();
  });

  it('names a clickable badge with its tooltip text', () => {
    render(<Badge label="Not responding" tooltip={{ body: 'Click to fix' }} onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Not responding. Click to fix' })).toBeInTheDocument();
  });
});
