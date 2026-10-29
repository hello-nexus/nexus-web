import { fireEvent, render, screen } from '@testing-library/react';
import { CircleHelp } from 'lucide-react';
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

  it('renders the given icon on a button link', () => {
    render(<TroubleshootLink label="Help" icon={CircleHelp} onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Help' }).querySelector('svg')).not.toBeNull();
  });

  it('replaces the external-link glyph with a given icon on an href link', () => {
    const { container: plain } = render(<TroubleshootLink label="A" href="https://example.com" />);
    const { container: custom } = render(<TroubleshootLink label="B" href="https://example.com" icon={CircleHelp} />);
    const external = plain.querySelector('svg')?.getAttribute('class');
    const override = custom.querySelector('svg')?.getAttribute('class');
    expect(custom.querySelectorAll('svg')).toHaveLength(1);
    expect(override).not.toBe(external);
  });

  it('keeps the external-link glyph on an href link without an icon', () => {
    const { container } = render(<TroubleshootLink label="Help" href="https://example.com" />);
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('external-link');
  });
});
