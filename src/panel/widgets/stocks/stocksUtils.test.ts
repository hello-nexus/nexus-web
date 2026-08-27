// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SYMBOLS,
  MAX_SYMBOLS,
  STOCK_GRAPH_CHART_HEIGHT_STACKED,
  STOCK_GRAPH_CHART_HEIGHT_WIDE,
  formatStockChangePercent,
  formatStockPrice,
  isStockUp,
  isWideStockSize,
  normalizeSymbols,
  resolveMode,
  resolvePeriod,
  resolveSymbols,
  splitColumns,
  stockGraphChartHeight,
  stockGraphRows,
  stockLabel,
  stockListLayout,
} from './stocksUtils';

describe('stockLabel', () => {
  it('maps known indexes to short names', () => {
    expect(stockLabel('^DJI')).toBe('Dow Jones');
    expect(stockLabel('^IXIC')).toBe('NASDAQ');
    expect(stockLabel('^GSPC')).toBe('S&P 500');
  });

  it('returns the raw symbol for anything else', () => {
    expect(stockLabel('AAPL')).toBe('AAPL');
    expect(stockLabel('EURUSD=X')).toBe('EURUSD=X');
  });
});

describe('normalizeSymbols', () => {
  it('trims and uppercases', () => {
    expect(normalizeSymbols(' aapl , goog ')).toEqual(['AAPL', 'GOOG']);
  });

  it('drops entries that do not match the Yahoo symbol shape', () => {
    expect(normalizeSymbols('AAPL,not a symbol,GOOG,')).toEqual(['AAPL', 'GOOG']);
  });

  it('keeps index and FX symbols with special characters', () => {
    expect(normalizeSymbols('^DJI,EURUSD=X,BRK.B')).toEqual(['^DJI', 'EURUSD=X', 'BRK.B']);
  });

  it('caps at MAX_SYMBOLS', () => {
    const many = Array.from({ length: MAX_SYMBOLS + 5 }, (_, i) => `SYM${i}`).join(',');
    expect(normalizeSymbols(many)).toHaveLength(MAX_SYMBOLS);
  });

  it('returns an empty array for null/undefined/empty input', () => {
    expect(normalizeSymbols(null)).toEqual([]);
    expect(normalizeSymbols(undefined)).toEqual([]);
    expect(normalizeSymbols('')).toEqual([]);
  });
});

describe('resolveSymbols', () => {
  it('falls back to the defaults when nothing valid remains', () => {
    expect(resolveSymbols('   ')).toEqual(normalizeSymbols(DEFAULT_SYMBOLS));
    expect(resolveSymbols(undefined)).toEqual(normalizeSymbols(DEFAULT_SYMBOLS));
  });

  it('passes through a valid saved list', () => {
    expect(resolveSymbols('msft,tsla')).toEqual(['MSFT', 'TSLA']);
  });
});

describe('resolveMode / resolvePeriod', () => {
  it('defaults to list mode for anything but "graph"', () => {
    expect(resolveMode(undefined)).toBe('list');
    expect(resolveMode('bogus')).toBe('list');
    expect(resolveMode('graph')).toBe('graph');
  });

  it('defaults to 1D for anything outside the known periods', () => {
    expect(resolvePeriod(undefined)).toBe('1D');
    expect(resolvePeriod('bogus')).toBe('1D');
    expect(resolvePeriod('3M')).toBe('3M');
  });
});

describe('formatStockPrice', () => {
  it('uses 0 decimals with grouping at or above 1000', () => {
    expect(formatStockPrice(52637.01, 'dot')).toBe('52,637');
  });

  it('uses 2 decimals between 10 and 1000', () => {
    expect(formatStockPrice(315.32, 'dot')).toBe('315.32');
  });

  it('uses 3 decimals below 10', () => {
    expect(formatStockPrice(1.142, 'dot')).toBe('1.142');
  });

  it('renders a placeholder for missing or non-finite values', () => {
    expect(formatStockPrice(null, 'dot')).toBe('--');
    expect(formatStockPrice(undefined, 'dot')).toBe('--');
    expect(formatStockPrice(Number.NaN, 'dot')).toBe('--');
  });
});

describe('formatStockChangePercent', () => {
  it('prefixes a positive change with a plus sign', () => {
    expect(formatStockChangePercent(0.285, 'dot')).toBe('+0.29%');
  });

  it('keeps the sign on a negative change', () => {
    expect(formatStockChangePercent(-0.297, 'dot')).toBe('-0.30%');
  });

  it('renders a placeholder for missing values', () => {
    expect(formatStockChangePercent(undefined, 'dot')).toBe('--');
  });

  it('does not double up the sign on negative zero', () => {
    expect(formatStockChangePercent(-0, 'dot')).toBe('+0.00%');
  });
});

describe('isStockUp', () => {
  it('treats zero, missing, and non-finite change as up', () => {
    expect(isStockUp(0)).toBe(true);
    expect(isStockUp(undefined)).toBe(true);
    expect(isStockUp(null)).toBe(true);
    expect(isStockUp(Number.NaN)).toBe(true);
  });

  it('treats a negative change as down', () => {
    expect(isStockUp(-0.01)).toBe(false);
  });

  it('treats a positive change as up', () => {
    expect(isStockUp(1.5)).toBe(true);
  });
});

describe('stockListLayout', () => {
  it('gives 4-wide sizes two columns and 2-wide sizes one column', () => {
    expect(stockListLayout('4x2')).toEqual({ columns: 2, rows: 3 });
    expect(stockListLayout('4x4')).toEqual({ columns: 2, rows: 4 });
    expect(stockListLayout('2x2')).toEqual({ columns: 1, rows: 3 });
    expect(stockListLayout('2x4')).toEqual({ columns: 1, rows: 6 });
  });
});

describe('stockGraphRows', () => {
  it('scales row count with the tile size', () => {
    expect(stockGraphRows('2x2')).toBe(2);
    expect(stockGraphRows('4x2')).toBe(3);
    expect(stockGraphRows('2x4')).toBe(6);
    expect(stockGraphRows('4x4')).toBe(6);
  });
});

describe('isWideStockSize', () => {
  it('is true only for the 4-wide sizes', () => {
    expect(isWideStockSize('4x2')).toBe(true);
    expect(isWideStockSize('4x4')).toBe(true);
    expect(isWideStockSize('2x2')).toBe(false);
    expect(isWideStockSize('2x4')).toBe(false);
    expect(isWideStockSize('1x1')).toBe(false);
  });
});

describe('stockGraphChartHeight', () => {
  it('returns the wide constant when not stacked and the stacked constant when stacked', () => {
    expect(stockGraphChartHeight(false)).toBe(STOCK_GRAPH_CHART_HEIGHT_WIDE);
    expect(stockGraphChartHeight(true)).toBe(STOCK_GRAPH_CHART_HEIGHT_STACKED);
  });
});

describe('splitColumns', () => {
  it('splits column-major: the first half fills column 1', () => {
    expect(splitColumns(['a', 'b', 'c', 'd', 'e', 'f'], 2)).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ]);
  });

  it('leaves an uneven remainder in the second column', () => {
    expect(splitColumns(['a', 'b', 'c'], 2)).toEqual([['a', 'b'], ['c']]);
  });

  it('returns a single column unchanged when columns <= 1', () => {
    expect(splitColumns(['a', 'b'], 1)).toEqual([['a', 'b']]);
  });
});
