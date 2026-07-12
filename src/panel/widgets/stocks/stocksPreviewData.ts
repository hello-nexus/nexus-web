import type { StockQuote } from '../../../api/stocks';

// Static fixture for the Stocks widget's Add-a-Widget catalog face. Content
// imitates a service /api/stocks snapshot at the default symbol list and
// range=1d - untranslated by design (see widget-preview-fixtures). A mix of
// up and down movers so the preview demonstrates both arrow/chip colors.

function series(start: number, end: number, points: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    // Gentle wobble around the linear trend so the sparkline reads as real
    // market data instead of a straight ramp.
    const wobble = Math.sin(i * 1.7) * (Math.abs(end - start) * 0.06);
    out.push(start + (end - start) * t + wobble);
  }
  return out;
}

export const STOCKS_PREVIEW: StockQuote[] = [
  {
    symbol: '^DJI',
    name: 'Dow Jones Industrial Average',
    price: 52637.01,
    change: 149.6,
    changePercent: 0.285,
    priceHint: 2,
    series: series(52310, 52637.01, 24),
  },
  {
    symbol: '^IXIC',
    name: 'NASDAQ Composite',
    price: 26282.44,
    change: -78.2,
    changePercent: -0.297,
    priceHint: 2,
    series: series(26410, 26282.44, 24),
  },
  {
    symbol: '^GSPC',
    name: 'S&P 500',
    price: 7575.18,
    change: 12.9,
    changePercent: 0.171,
    priceHint: 2,
    series: series(7540, 7575.18, 24),
  },
  {
    symbol: 'EURUSD=X',
    name: 'EUR/USD',
    price: 1.142,
    change: -0.004,
    changePercent: -0.349,
    priceHint: 4,
    series: series(1.148, 1.142, 24),
  },
  {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    price: 315.32,
    change: 3.87,
    changePercent: 1.24,
    priceHint: 2,
    series: series(305, 315.32, 24),
  },
  {
    symbol: 'GOOG',
    name: 'Alphabet Inc.',
    price: 355.03,
    change: -2.15,
    changePercent: -0.6,
    priceHint: 2,
    series: series(360, 355.03, 24),
  },
];
