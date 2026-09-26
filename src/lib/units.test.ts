// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  convertTemperature, tempUnitSymbol, isCelsiusUnit,
  formatNumber, resolveHour12, localizeNumbers, formatDate, formatDateTime, DATE_FORMATS,
  type DateFormat, type DateVariant,
} from './units';

describe('convertTemperature', () => {
  it('is identity for celsius', () => {
    expect(convertTemperature(45, 'c')).toBe(45);
    expect(convertTemperature(-10, 'c')).toBe(-10);
  });
  it('converts celsius to fahrenheit', () => {
    expect(convertTemperature(0, 'f')).toBe(32);
    expect(convertTemperature(100, 'f')).toBe(212);
    expect(convertTemperature(45, 'f')).toBe(113);
  });
});

describe('tempUnitSymbol', () => {
  it('returns the degree symbol for each unit', () => {
    expect(tempUnitSymbol('c')).toBe('°C');
    expect(tempUnitSymbol('f')).toBe('°F');
  });
});

describe('isCelsiusUnit', () => {
  it('matches the service celsius unit leniently', () => {
    expect(isCelsiusUnit('°C')).toBe(true);
    expect(isCelsiusUnit('C')).toBe(true);
    expect(isCelsiusUnit(' °C ')).toBe(true);
  });
  it('rejects non-celsius units', () => {
    expect(isCelsiusUnit('°F')).toBe(false);
    expect(isCelsiusUnit('%')).toBe(false);
    expect(isCelsiusUnit('RPM')).toBe(false);
    expect(isCelsiusUnit('GHz')).toBe(false);
  });
});

describe('formatNumber', () => {
  it('uses period decimal / comma grouping for dot format', () => {
    expect(formatNumber(1234.56, 'dot')).toBe('1,234.56');
    expect(formatNumber(1800, 'dot')).toBe('1,800');
  });
  it('uses comma decimal / period grouping for comma format', () => {
    expect(formatNumber(1234.56, 'comma')).toBe('1.234,56');
    expect(formatNumber(1800, 'comma')).toBe('1.800');
  });
  it('honors formatting options', () => {
    expect(formatNumber(45.678, 'dot', { maximumFractionDigits: 0 })).toBe('46');
  });
  it('returns a string for the system format', () => {
    expect(typeof formatNumber(1234.5, 'system')).toBe('string');
  });
  it('passes non-finite values through', () => {
    expect(formatNumber(NaN, 'dot')).toBe('NaN');
    expect(formatNumber(Infinity, 'dot')).toBe('Infinity');
  });
});

describe('localizeNumbers', () => {
  it('is a no-op for the dot format (source form)', () => {
    expect(localizeNumbers('62.5 %', 'dot')).toBe('62.5 %');
    expect(localizeNumbers('10.3 / 31.1 GB', 'dot')).toBe('10.3 / 31.1 GB');
  });
  it('swaps decimal and grouping separators for the comma format', () => {
    expect(localizeNumbers('62.5 %', 'comma')).toBe('62,5 %');
    expect(localizeNumbers('3.6 GHz', 'comma')).toBe('3,6 GHz');
    expect(localizeNumbers('1,800 RPM', 'comma')).toBe('1.800 RPM');
    expect(localizeNumbers('10.3 / 31.1 GB', 'comma')).toBe('10,3 / 31,1 GB');
  });
  it('preserves grouping structure without inventing or dropping it', () => {
    expect(localizeNumbers('1800 RPM', 'comma')).toBe('1800 RPM');
    expect(localizeNumbers('1,234.56', 'comma')).toBe('1.234,56');
  });
  it('leaves non-numeric text alone', () => {
    expect(localizeNumbers('- ', 'comma')).toBe('- ');
    expect(localizeNumbers('N/A', 'comma')).toBe('N/A');
  });
});

describe('resolveHour12', () => {
  it('pins the explicit formats', () => {
    expect(resolveHour12('12h')).toBe(true);
    expect(resolveHour12('24h')).toBe(false);
  });
  it('derives a boolean from the runtime locale for system', () => {
    expect(typeof resolveHour12('system')).toBe('boolean');
  });
});

describe('formatDate', () => {
  // 2026-12-31 22:30 UTC: already Jan 1 2027 in Tokyo.
  const d = new Date(Date.UTC(2026, 11, 31, 22, 30));
  const utc = (fmt: DateFormat, variant?: DateVariant) => formatDate(d, fmt, { tz: 'UTC', variant });
  const names = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).formatToParts(d);
  const weekday = names.find(p => p.type === 'weekday')!.value;
  const month = names.find(p => p.type === 'month')!.value;

  it('renders numeric patterns with padded Latin digits', () => {
    expect(utc('yyyy-mm-dd')).toBe('2026-12-31');
    expect(utc('yyyy/mm/dd')).toBe('2026/12/31');
    expect(utc('dd/mm/yy')).toBe('31/12/26');
    expect(utc('mm/dd/yyyy')).toBe('12/31/2026');
    expect(utc('dd-mm-yy')).toBe('31-12-26');
    expect(utc('dd.mm.yyyy')).toBe('31.12.2026');
    expect(utc('dd-mm-yyyy')).toBe('31-12-2026');
    expect(utc('dd.mm.yy')).toBe('31.12.26');
    expect(utc('yyyy. m. d.')).toBe('2026. 12. 31.');
    expect(utc('yyyy年m月d日')).toBe('2026年12月31日');
    const march5 = new Date(Date.UTC(2026, 2, 5, 12));
    expect(formatDate(march5, 'dd/mm/yy', { tz: 'UTC' })).toBe('05/03/26');
    expect(formatDate(march5, 'yyyy. m. d.', { tz: 'UTC' })).toBe('2026. 3. 5.');
    expect(formatDate(march5, 'yyyy年m月d日', { tz: 'UTC' })).toBe('2026年3月5日');
  });

  it('fills name tokens from the locale', () => {
    expect(utc('ddd, d mmm')).toBe(`${weekday}, 31 ${month}`);
    expect(utc('mmm d, yyyy')).toBe(`${month} 31, 2026`);
    expect(formatDate(new Date(Date.UTC(2026, 2, 5, 12)), 'd mmm', { tz: 'UTC' })).toMatch(/^5 /);
  });

  it('resolves the calendar day in the given zone', () => {
    expect(formatDate(d, 'yyyy-mm-dd', { tz: 'Asia/Tokyo' })).toBe('2027-01-01');
  });

  it('short keeps only day and month in the pattern order', () => {
    expect(utc('ddd, d mmm yyyy', 'short')).toBe(`31 ${month}`);
    expect(utc('mmm d, yyyy', 'short')).toBe(`${month} 31`);
    expect(utc('dd/mm/yy', 'short')).toBe('31/12');
    expect(utc('mm/dd/yyyy', 'short')).toBe('12/31');
    expect(utc('dd.mm.yyyy', 'short')).toBe('31.12');
    expect(utc('yyyy-mm-dd', 'short')).toBe('12-31');
    expect(utc('yyyy/mm/dd', 'short')).toBe('12/31');
    expect(utc('dd-mm-yyyy', 'short')).toBe('31-12');
    expect(utc('dd.mm.yy', 'short')).toBe('31.12');
    expect(utc('yyyy. m. d.', 'short')).toBe('12. 31.');
    expect(utc('yyyy年m月d日', 'short')).toBe('12月31日');
  });

  it('year drops the weekday and always carries the year', () => {
    expect(utc('ddd, d mmm', 'year')).toBe(`31 ${month} 2026`);
    expect(utc('ddd, mmm d', 'year')).toBe(`${month} 31, 2026`);
    expect(utc('mmm d', 'year')).toBe(`${month} 31, 2026`);
    expect(utc('ddd, d mmm yyyy', 'year')).toBe(`31 ${month} 2026`);
    expect(utc('dd/mm/yy', 'year')).toBe('31/12/26');
  });

  it('never leaves a pattern token behind in any variant', () => {
    for (const fmt of DATE_FORMATS) {
      for (const variant of ['full', 'year', 'short'] as const) {
        expect(utc(fmt, variant).replace(weekday, '').replace(month, '')).not.toMatch(/[dmy]/);
      }
    }
  });

  it('system renders the surface options, or the variant default', () => {
    expect(formatDate(d, 'system', { tz: 'UTC', locale: 'en-US', system: { year: 'numeric', month: 'long', day: 'numeric' } })).toBe('December 31, 2026');
    expect(formatDate(d, 'system', { tz: 'UTC', locale: 'en-US', variant: 'short' })).toBe('Dec 31');
    expect(formatDate(d, 'system', { tz: 'UTC', locale: 'en-US' })).toBe('Thu, Dec 31');
  });

  it('falls back to the system format for an unknown pattern', () => {
    expect(formatDate(d, 'q/q' as never, { tz: 'UTC' })).toBe(formatDate(d, 'system', { tz: 'UTC' }));
  });

  it('gives every preset a distinct specimen', () => {
    const specimens = DATE_FORMATS.filter(f => f !== 'system').map(f => utc(f));
    expect(new Set(specimens).size).toBe(specimens.length);
  });
});

describe('formatDateTime', () => {
  const d = new Date(Date.UTC(2026, 11, 31, 22, 30));
  // timeZone rides in the surface options, as a caller would pass it.
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: false, timeZone: 'UTC' };

  it('is the surface options on system', () => {
    expect(formatDateTime(d, 'system', opts, { locale: 'en-US' })).toBe(new Intl.DateTimeFormat('en-US', opts).format(d));
  });

  it('joins the pattern date with the surface time fields on a custom pattern', () => {
    expect(formatDateTime(d, 'yyyy-mm-dd', opts, { locale: 'en-US', variant: 'short' })).toBe('12-31 22:30');
    expect(formatDateTime(d, 'dd/mm/yyyy', opts, { locale: 'en-US', variant: 'year' })).toBe('31/12/2026 22:30');
  });
});
