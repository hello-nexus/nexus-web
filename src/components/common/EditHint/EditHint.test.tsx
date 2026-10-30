import { render } from '@testing-library/react';
import { Lock } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { EditHint } from './EditHint';

describe('EditHint', () => {
  it('is decorative and carries the label when given', () => {
    const { container, getByText } = render(<EditHint label="Edit widget" />);
    expect(container.querySelector('[data-edit-hint-overlay]')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('svg')).not.toBeNull();
    expect(getByText('Edit widget')).toBeTruthy();
  });

  it('renders icon-only without a label', () => {
    const { container } = render(<EditHint />);
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.textContent).toBe('');
  });

  it('takes another glyph and caption, for the lock notice', () => {
    const { container, getByText } = render(<EditHint icon={Lock} label="Widget locked" />);
    expect(container.querySelector('svg.lucide-lock')).not.toBeNull();
    expect(container.querySelector('svg.lucide-pencil')).toBeNull();
    expect(getByText('Widget locked')).toBeTruthy();
  });

  it('places the glyph and label in a given area, and never breaks a word of the label', () => {
    const { container } = render(<EditHint label="Edit background" area={{ left: 4, top: 6, width: 80, height: 40 }} />);
    const area = container.querySelector('[data-edit-hint-overlay] > div') as HTMLElement;
    expect(area.style.left).toBe('4px');
    expect(area.style.height).toBe('40px');
  });

  it('takes explicit glyph and label sizes for a host that is not a widget cell', () => {
    const { container } = render(<EditHint label="Edit background" fit={{ icon: 40, font: 18 }} />);
    const root = container.querySelector('[data-edit-hint-overlay]') as HTMLElement;
    expect(root.style.getPropertyValue('--edit-hint-icon-size')).toBe('40px');
    expect(root.style.getPropertyValue('--edit-hint-label-size')).toBe('18px');
    expect(container.querySelector('[data-fit="true"]')?.textContent).toBe('Edit background');
  });
});
