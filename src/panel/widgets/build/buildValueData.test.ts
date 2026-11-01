import { describe, expect, it } from 'vitest';
import { fill, formatMoney, valueLines, type BuildValueView } from './buildValueData';

const labels = { owned: 'Build value', upgraded: 'With upgrades', delta: '{amount} upgrades', unpriced: '{count} parts unpriced', asOf: 'as of {date}' };
const view = (over: Partial<BuildValueView['data']> = {}): BuildValueView => ({ labels, data: { currency: 'USD', asOf: '2026-11-01T12:00:00Z', owned: 1891.29, unpriced: 0, ...over } });

describe('valueLines', () => {
  it('shows only the owned figure when nothing was added', () => {
    const lines = valueLines(view(), 'en');
    expect(lines.owned).toBe('$1,891');
    expect(lines.upgraded).toBeNull();
    expect(lines.delta).toBeNull();
  });

  it('adds the figure with upgrades and the difference', () => {
    const lines = valueLines(view({ upgrades: 419.98 }), 'en');
    expect(lines.upgraded).toBe('$2,311');
    expect(lines.delta).toBe('+$420 upgrades');
  });

  it('counts unpriced parts instead of pricing them at zero', () => {
    expect(valueLines(view({ unpriced: 2 }), 'en').unpriced).toBe('2 parts unpriced');
    expect(valueLines(view({ unpriced: 0 }), 'en').unpriced).toBeNull();
  });
});

describe('helpers', () => {
  it('fill keeps an unknown token as it is', () => {
    expect(fill('{a} {b}', { a: 1 })).toBe('1 {b}');
  });

  it('formatMoney falls back on an unknown currency code', () => {
    expect(formatMoney(5, 'XXXXXX', 'en')).toBe('5 XXXXXX');
  });
});
