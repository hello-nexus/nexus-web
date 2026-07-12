import { describe, expect, it } from 'vitest';
import { buildMonthCells, resolveWeekStart, weekdayInitials } from './calendar';

describe('resolveWeekStart', () => {
  it('honours an explicit choice regardless of language', () => {
    expect(resolveWeekStart('sunday', 'de')).toBe(0);
    expect(resolveWeekStart('monday', 'en')).toBe(1);
  });

  it('derives the auto default from the language', () => {
    expect(resolveWeekStart('auto', 'en')).toBe(0);
    expect(resolveWeekStart('auto', 'ja')).toBe(0);
    expect(resolveWeekStart('auto', 'pt-BR')).toBe(0);
    expect(resolveWeekStart('auto', 'de')).toBe(1);
    expect(resolveWeekStart('auto', 'pt')).toBe(1);
    expect(resolveWeekStart('auto', 'fur')).toBe(1);
  });
});

describe('buildMonthCells', () => {
  // July 2026 starts on a Wednesday; June has 30 days, July 31.
  it('pads leading/trailing days to whole weeks (Sunday start)', () => {
    const cells = buildMonthCells(2026, 6, 0);
    expect(cells.length % 7).toBe(0);
    expect(cells.length).toBe(35);
    expect(cells[0]).toEqual({ day: 28, inMonth: false });
    expect(cells[2]).toEqual({ day: 30, inMonth: false });
    expect(cells[3]).toEqual({ day: 1, inMonth: true });
    expect(cells[33]).toEqual({ day: 31, inMonth: true });
    expect(cells[34]).toEqual({ day: 1, inMonth: false });
  });

  it('shifts the leading pad when the week starts on Monday', () => {
    const cells = buildMonthCells(2026, 6, 1);
    expect(cells[0]).toEqual({ day: 29, inMonth: false });
    expect(cells[1]).toEqual({ day: 30, inMonth: false });
    expect(cells[2]).toEqual({ day: 1, inMonth: true });
  });

  // February 2026 starts on a Sunday and has 28 days: exactly 4 rows, no pad.
  it('emits no padding when the month fills whole weeks', () => {
    const cells = buildMonthCells(2026, 1, 0);
    expect(cells.length).toBe(28);
    expect(cells.every(c => c.inMonth)).toBe(true);
    expect(cells[0]).toEqual({ day: 1, inMonth: true });
    expect(cells[27]).toEqual({ day: 28, inMonth: true });
  });
});

describe('weekdayInitials', () => {
  it('returns seven labels rotated by the week start', () => {
    const sun = weekdayInitials('en', 0);
    const mon = weekdayInitials('en', 1);
    expect(sun).toHaveLength(7);
    expect(mon).toHaveLength(7);
    for (let i = 0; i < 7; i++) expect(mon[i]).toBe(sun[(i + 1) % 7]);
  });
});
