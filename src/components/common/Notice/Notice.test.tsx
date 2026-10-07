import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Notice, NoticeSecondary } from './Notice';

describe('Notice', () => {
  it('renders its content, secondary line and actions', () => {
    render(
      <Notice tone="warning" role="status" actions={<button type="button">Do it</button>}>
        <span>Main text</span>
        <NoticeSecondary>Cause</NoticeSecondary>
      </Notice>,
    );
    expect(screen.getByRole('status').textContent).toContain('Main text');
    expect(screen.getByText('Cause')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Do it' })).toBeTruthy();
  });

  it('marks the tone so warning and critical stay distinct', () => {
    const { rerender } = render(<Notice tone="warning" role="alert">x</Notice>);
    expect(screen.getByRole('alert').getAttribute('data-tone')).toBe('warning');
    rerender(<Notice tone="critical" role="alert">x</Notice>);
    expect(screen.getByRole('alert').getAttribute('data-tone')).toBe('critical');
  });

  it('passes the role through and omits the actions slot when there are none', () => {
    const { container } = render(<Notice tone="critical">x</Notice>);
    expect(container.firstElementChild?.getAttribute('role')).toBeNull();
    // The icon and the body only: no empty actions column.
    expect(container.firstElementChild?.children).toHaveLength(2);
  });
});
