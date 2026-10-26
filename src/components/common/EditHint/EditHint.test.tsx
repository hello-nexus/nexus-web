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
});
