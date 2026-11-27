import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MiniMonth } from './MiniMonth';

vi.mock('../../../lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key, language: 'en' }) }));

const day = (m: number, d: number) => new Date(2026, m, d).getTime();

function setup() {
  const props = { onSelect: vi.fn(), onMonthChange: vi.fn(), onSelectMonth: vi.fn() };
  render(<MiniMonth month={day(10, 1)} selected={day(10, 17)} today={day(10, 17)} weekStart={0} {...props} />);
  return props;
}

describe('MiniMonth', () => {
  it('steps months from the day grid', () => {
    const p = setup();
    fireEvent.click(screen.getByRole('button', { name: 'datepicker.nextMonth' }));
    expect(p.onMonthChange).toHaveBeenCalledWith(1);
  });

  it('drills up to a year view whose arrows step a year', () => {
    const p = setup();
    fireEvent.click(screen.getByRole('button', { name: 'datepicker.showYear' }));
    expect(screen.getByText('2026')).toBeTruthy();
    expect(screen.getAllByRole('button', { pressed: true })[0].textContent).toBe('Nov');
    fireEvent.click(screen.getByRole('button', { name: 'datepicker.nextYear' }));
    expect(p.onMonthChange).toHaveBeenCalledWith(12);
  });

  it('picks a month and returns to the day grid', () => {
    const p = setup();
    fireEvent.click(screen.getByRole('button', { name: 'datepicker.showYear' }));
    fireEvent.click(screen.getByText('Feb'));
    expect(p.onSelectMonth).toHaveBeenCalledWith(day(1, 1));
    expect(screen.getByRole('button', { name: 'datepicker.showYear' })).toBeTruthy();
  });

  it('returns on Escape or the title without picking', () => {
    const p = setup();
    fireEvent.click(screen.getByRole('button', { name: 'datepicker.showYear' }));
    fireEvent.keyDown(screen.getByText('Feb'), { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'datepicker.showYear' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'datepicker.showYear' }));
    fireEvent.click(screen.getByRole('button', { name: 'datepicker.showMonths' }));
    expect(p.onSelectMonth).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'datepicker.showYear' })).toBeTruthy();
  });
});
