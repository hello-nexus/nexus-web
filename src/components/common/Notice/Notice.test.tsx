import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

  it('marks the level so info, warning and critical stay distinct', () => {
    const { rerender } = render(<Notice tone="info" role="alert">x</Notice>);
    expect(screen.getByRole('alert').getAttribute('data-tone')).toBe('info');
    rerender(<Notice tone="warning" role="alert">x</Notice>);
    expect(screen.getByRole('alert').getAttribute('data-tone')).toBe('warning');
    rerender(<Notice tone="critical" role="alert">x</Notice>);
    expect(screen.getByRole('alert').getAttribute('data-tone')).toBe('critical');
  });

  it('passes the role through and omits the actions slot when there are none', () => {
    const { container } = render(<Notice tone="critical">x</Notice>);
    expect(container.firstElementChild?.getAttribute('role')).toBeNull();
    // One group holding the icon and the body, and no empty actions column.
    const row = container.firstElementChild?.firstElementChild;
    expect(row?.children).toHaveLength(1);
    expect(row?.firstElementChild?.children).toHaveLength(2);
  });

  it('closes through its own button when dismissable', () => {
    const onDismiss = vi.fn();
    render(<Notice tone="warning" role="status" onDismiss={onDismiss} dismissLabel="Close">x</Notice>);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('has no close button unless asked', () => {
    render(<Notice tone="warning" role="status">x</Notice>);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
