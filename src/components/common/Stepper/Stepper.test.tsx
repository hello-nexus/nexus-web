import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Stepper } from './Stepper';

vi.mock('../../../lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe('Stepper', () => {
  it('steps within its limits', () => {
    const onChange = vi.fn();
    render(<Stepper value={19} min={0} max={20} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'common.increment' }));
    expect(onChange).toHaveBeenLastCalledWith(20);
    fireEvent.click(screen.getByRole('button', { name: 'common.decrement' }));
    expect(onChange).toHaveBeenLastCalledWith(18);
  });

  it('disables the button at a limit', () => {
    render(<Stepper value={20} min={0} max={20} />);
    expect(screen.getByRole('button', { name: 'common.increment' })).toBeDisabled();
  });

  it('is a named group when given a label, and unnamed without one', () => {
    const { rerender } = render(<Stepper value={5} label="Center volume" />);
    expect(screen.getByRole('group', { name: 'Center volume' })).toBeInTheDocument();
    rerender(<Stepper value={5} />);
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('puts minus before plus in the horizontal form', () => {
    render(<Stepper value={5} orientation="horizontal" />);
    const names = screen.getAllByRole('button').map(b => b.getAttribute('aria-label'));
    expect(names).toEqual(['common.decrement', 'common.increment']);
  });
});
