import { render } from '@testing-library/react';
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
});
