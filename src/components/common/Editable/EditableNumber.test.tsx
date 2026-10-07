import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EditableNumber } from './EditableNumber';

describe('EditableNumber disabled', () => {
  it('shows plain text that cannot be entered', () => {
    const onCommit = vi.fn();
    render(<EditableNumber value={5} min={0} max={10} onCommit={onCommit} ariaLabel="Level" disabled />);
    expect(screen.queryByRole('button')).toBeNull();
    // The accessible name is real text, not an aria-label on a role-less span.
    fireEvent.click(screen.getByText('Level'));
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });

  it('drops an edit in progress when it becomes disabled, so no stale input returns', () => {
    const { rerender } = render(<EditableNumber value={5} min={0} max={10} onCommit={() => {}} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('spinbutton')).toBeTruthy();
    rerender(<EditableNumber value={5} min={0} max={10} onCommit={() => {}} disabled />);
    rerender(<EditableNumber value={5} min={0} max={10} onCommit={() => {}} />);
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.getByRole('button')).toBeTruthy();
  });
});
