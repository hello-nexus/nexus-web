import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TroubleshootLink } from './TroubleshootLink';

describe('TroubleshootLink', () => {
  it('opens an outside page in a new tab with href', () => {
    render(<TroubleshootLink label="Help" href="https://example.com/help" />);
    const link = screen.getByRole('link', { name: 'Help' });
    expect(link.getAttribute('href')).toBe('https://example.com/help');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.querySelector('svg')).not.toBeNull();
  });

  it('is a button that calls onClick without href', () => {
    const onClick = vi.fn();
    render(<TroubleshootLink label="Help" onClick={onClick} />);
    expect(screen.getByRole('button', { name: 'Help' }).querySelector('svg')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
