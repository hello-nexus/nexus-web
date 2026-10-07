import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox } from './Checkbox';

describe('Checkbox', () => {
  it('is named by its label and reports the next value', () => {
    const onChange = vi.fn();
    render(<Checkbox checked={false} onChange={onChange} label="Don't ask again" />);
    fireEvent.click(screen.getByRole('checkbox', { name: "Don't ask again" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('is disabled when asked', () => {
    render(<Checkbox checked disabled onChange={() => {}} label="Locked" />);
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });
});
