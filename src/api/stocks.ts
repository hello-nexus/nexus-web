import { fetchService } from './service';

export interface StockQuote {
  symbol: string;
  name?: string;
  price?: number;
  change?: number;
  changePercent?: number;
  priceHint?: number;
  series?: number[];
}

export interface StockQuotesResponse {
  range: string;
  quotes: StockQuote[];
}

// Yahoo Finance range codes the service accepts, keyed by the widget's
// user-facing period. 1D pins list mode's daily-change arrow; the rest only
// apply in graph mode.
export type StockPeriod = '1D' | '1W' | '1M' | '3M' | '1Y';

const PERIOD_RANGE: Record<StockPeriod, string> = {
  '1D': '1d',
  '1W': '5d',
  '1M': '1mo',
  '3M': '3mo',
  '1Y': '1y',
};

export function stockPeriodToRange(period: StockPeriod): string {
  return PERIOD_RANGE[period];
}

export function fetchStockQuotes(symbols: string[], period: StockPeriod): Promise<StockQuotesResponse | null> {
  const params = new URLSearchParams({ symbols: symbols.join(','), range: stockPeriodToRange(period) });
  return fetchService<StockQuotesResponse>(`/api/stocks?${params.toString()}`);
}
