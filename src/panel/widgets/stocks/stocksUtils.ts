// Pure helpers for the Stocks widget: symbol normalization, display labels,
// price formatting, and list/graph layout math. Kept free of React so they
// are unit-testable (see stocksUtils.test.ts).

import type { StockPeriod } from '../../../api/stocks';
import { formatNumber, type NumberFormat } from '../../../lib/units';
import type { PanelWidgetSize } from '../../types';

export const DEFAULT_SYMBOLS = '^DJI,^IXIC,^GSPC,EURUSD=X,AAPL,GOOG';
export const MAX_SYMBOLS = 12;

// Short display names for the handful of index tickers whose raw Yahoo
// symbol reads poorly. Everything else renders as-is - these are proper
// nouns/tickers, exempt from i18n.
const SYMBOL_LABELS: Record<string, string> = {
  '^DJI': 'Dow Jones',
  '^IXIC': 'NASDAQ',
  '^GSPC': 'S&P 500',
};

export function stockLabel(symbol: string): string {
  return SYMBOL_LABELS[symbol] ?? symbol;
}

const SYMBOL_RE = /^[A-Z0-9^.=-]{1,12}$/;

/** Trim, uppercase, drop entries that don't match the Yahoo symbol shape, cap at MAX_SYMBOLS. Idempotent. */
export function normalizeSymbols(raw: string | null | undefined): string[] {
  const out: string[] = [];
  for (const part of (raw ?? '').split(',')) {
    const symbol = part.trim().toUpperCase();
    if (!symbol || !SYMBOL_RE.test(symbol)) continue;
    out.push(symbol);
    if (out.length >= MAX_SYMBOLS) break;
  }
  return out;
}

/** Widget-facing symbol list: normalizes the saved config, falling back to the defaults when nothing valid remains. */
export function resolveSymbols(raw: string | null | undefined): string[] {
  const normalized = normalizeSymbols(raw);
  return normalized.length > 0 ? normalized : normalizeSymbols(DEFAULT_SYMBOLS);
}

export type StockDisplayMode = 'list' | 'graph';

export function resolveMode(raw: unknown): StockDisplayMode {
  return raw === 'graph' ? 'graph' : 'list';
}

const PERIODS: readonly StockPeriod[] = ['1D', '1W', '1M', '3M', '1Y'];

export function resolvePeriod(raw: unknown): StockPeriod {
  return (PERIODS as readonly unknown[]).includes(raw) ? (raw as StockPeriod) : '1D';
}

export const PRICE_PLACEHOLDER = '--';

/**
 * Fewer decimals as the price gets larger, matching the reference Apple
 * Stocks formatting bucket-for-bucket. Deliberately ignores the payload's
 * priceHint.
 */
export function formatStockPrice(value: number | null | undefined, numberFormat: NumberFormat): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return PRICE_PLACEHOLDER;
  const abs = Math.abs(value);
  const decimals = abs >= 1000 ? 0 : abs >= 10 ? 2 : 3;
  return formatNumber(value, numberFormat, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** changePercent arrives from the service already in percent units, not a fraction. */
export function formatStockChangePercent(value: number | null | undefined, numberFormat: NumberFormat): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return PRICE_PLACEHOLDER;
  // Collapse negative zero to positive zero first: value >= 0 already reads
  // -0 as non-negative, but Intl.NumberFormat still renders -0 with its own
  // minus sign, which would otherwise double up with the '+' below.
  const normalized = value === 0 ? 0 : value;
  const sign = normalized >= 0 ? '+' : '';
  return `${sign}${formatNumber(normalized, numberFormat, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

/** Sign of `change`; missing/non-finite/zero all read as up, matching the reference app. */
export function isStockUp(change: number | null | undefined): boolean {
  return !(typeof change === 'number' && Number.isFinite(change) && change < 0);
}

export interface StockListLayout {
  columns: 1 | 2;
  rows: number;
}

const LIST_LAYOUT: Record<PanelWidgetSize, StockListLayout> = {
  '1x1': { columns: 1, rows: 3 },
  '2x2': { columns: 1, rows: 3 },
  '2x4': { columns: 1, rows: 6 },
  '4x2': { columns: 2, rows: 3 },
  '4x4': { columns: 2, rows: 4 },
};

const GRAPH_ROWS: Record<PanelWidgetSize, number> = {
  '1x1': 2,
  '2x2': 2,
  '2x4': 6,
  '4x2': 3,
  '4x4': 6,
};

export function stockListLayout(size: PanelWidgetSize): StockListLayout {
  return LIST_LAYOUT[size] ?? LIST_LAYOUT['4x2'];
}

export function stockGraphRows(size: PanelWidgetSize): number {
  return GRAPH_ROWS[size] ?? GRAPH_ROWS['4x2'];
}

/** Column-major split: the first ceil(n / columns) items fill column 1, the remainder column 2. */
export function splitColumns<T>(items: T[], columns: number): T[][] {
  if (columns <= 1) return [items];
  const perColumn = Math.ceil(items.length / columns);
  const out: T[][] = [];
  for (let c = 0; c < columns; c++) out.push(items.slice(c * perColumn, (c + 1) * perColumn));
  return out;
}
