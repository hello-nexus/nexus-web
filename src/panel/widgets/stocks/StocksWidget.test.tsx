import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PanelWidget } from '../../types';
import { StocksWidget } from './StocksWidget';
import { formatStockPrice } from './stocksUtils';

const fetchStockQuotesMock = vi.hoisted(() => vi.fn());

vi.mock('../../../api/stocks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/stocks')>();
  return { ...actual, fetchStockQuotes: fetchStockQuotesMock };
});

vi.mock('../../../lib/i18n', () => {
  const dict: Record<string, string> = {
    'common.loading': 'Loading...',
    'panel.widget.stocks.noData': 'No data',
  };
  const t = (key: string) => dict[key] ?? key;
  return { useTranslation: () => ({ t }) };
});

function stocksWidget(size: PanelWidget['size'], config?: Record<string, unknown>): PanelWidget {
  return { id: `stocks-${size}`, type: 'stocks', size, col: 0, row: 0, config: config as PanelWidget['config'] };
}

const dowPrice = formatStockPrice(52637.01, 'system');
const applePrice = formatStockPrice(315.32, 'system');

describe('StocksWidget', () => {
  afterEach(() => vi.clearAllMocks());

  it('renders the default list layout with the daily arrow and price', async () => {
    fetchStockQuotesMock.mockResolvedValue({
      range: '1d',
      quotes: [
        { symbol: '^DJI', name: 'Dow Jones Industrial Average', price: 52637.01, change: 149.6, changePercent: 0.285 },
      ],
    });
    render(<StocksWidget widget={stocksWidget('4x2')} />);
    expect(await screen.findByText('Dow Jones')).toBeInTheDocument();
    expect(screen.getByText(dowPrice)).toBeInTheDocument();
    expect(fetchStockQuotesMock).toHaveBeenCalledWith(expect.any(Array), '1D');
  });

  it('pins the range to 1D in list mode even if a graph period was saved', async () => {
    fetchStockQuotesMock.mockResolvedValue({ range: '1d', quotes: [] });
    render(<StocksWidget widget={stocksWidget('4x2', { mode: 'list', period: '1Y' })} />);
    await screen.findByText('Dow Jones');
    expect(fetchStockQuotesMock).toHaveBeenCalledWith(expect.any(Array), '1D');
  });

  it('requests the configured range and uses the single-line chart layout at a 4-wide size', async () => {
    fetchStockQuotesMock.mockResolvedValue({
      range: '1mo',
      quotes: [{ symbol: 'AAPL', name: 'Apple Inc.', price: 315.32, change: 3.87, changePercent: 1.24, series: [300, 305, 310, 315.32] }],
    });
    render(<StocksWidget widget={stocksWidget('4x2', { mode: 'graph', period: '1M', symbols: 'AAPL' })} />);
    expect(await screen.findByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText(applePrice)).toBeInTheDocument();
    expect(fetchStockQuotesMock).toHaveBeenCalledWith(['AAPL'], '1M');
    expect(document.querySelector('svg')).toHaveAttribute('height', '28');
  });

  it('stacks label+price above chart+chip at a 2-wide graph size', async () => {
    fetchStockQuotesMock.mockResolvedValue({
      range: '1mo',
      quotes: [{ symbol: 'AAPL', name: 'Apple Inc.', price: 315.32, change: 3.87, changePercent: 1.24, series: [300, 305, 310, 315.32] }],
    });
    render(<StocksWidget widget={stocksWidget('2x2', { mode: 'graph', period: '1M', symbols: 'AAPL' })} />);
    expect(await screen.findByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText(applePrice)).toBeInTheDocument();
    expect(screen.getByText('+1.24%')).toBeInTheDocument();
    expect(document.querySelector('svg')).toHaveAttribute('height', '20');
  });

  it('renders a placeholder price for a symbol the service omitted', async () => {
    fetchStockQuotesMock.mockResolvedValue({ range: '1d', quotes: [] });
    render(<StocksWidget widget={stocksWidget('4x2', { symbols: 'AAPL' })} />);
    expect(await screen.findByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('--')).toBeInTheDocument();
  });

  it('shows the no-data state when the service never returns quotes', async () => {
    fetchStockQuotesMock.mockResolvedValue(null);
    render(<StocksWidget widget={stocksWidget('4x2')} />);
    expect(await screen.findByText('No data')).toBeInTheDocument();
  });
});
