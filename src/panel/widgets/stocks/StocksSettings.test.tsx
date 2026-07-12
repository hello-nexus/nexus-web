import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PanelWidget } from '../../types';
import { StocksSettings } from './StocksSettings';
import { DEFAULT_SYMBOLS } from './stocksUtils';

vi.mock('../../../components/common/Select/Select', () => ({
  Select: ({ value, onChange, options, ariaLabel, disabled }: {
    value: string; onChange: (v: string) => void;
    options?: { value: string; label: string; disabled?: boolean }[];
    ariaLabel?: string; disabled?: boolean;
  }) => (
    <select aria-label={ariaLabel} value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>
      {options?.map(o => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
    </select>
  ),
}));

vi.mock('../../../lib/i18n', () => {
  const dict: Record<string, string> = {
    'panel.widget.stocks.settings.style': 'Style',
    'panel.widget.stocks.settings.list': 'List',
    'panel.widget.stocks.settings.graph': 'Graph',
    'panel.widget.stocks.settings.period': 'Period',
    'panel.widget.stocks.settings.period1d': '1D',
    'panel.widget.stocks.settings.period1w': '1W',
    'panel.widget.stocks.settings.period1m': '1M',
    'panel.widget.stocks.settings.period3m': '3M',
    'panel.widget.stocks.settings.period1y': '1Y',
    'panel.widget.stocks.settings.symbols': 'Symbols',
    'panel.widget.stocks.settings.symbolsHint': 'Comma-separated Yahoo Finance symbols, e.g. AAPL, ^GSPC, EURUSD=X',
    'panel.widget.stocks.settings.useAccentColor': 'Use accent color',
    'common.desktopOnly': 'Full options available on desktop',
  };
  const t = (key: string) => dict[key] ?? key;
  return { useTranslation: () => ({ t }) };
});

vi.mock('../../../components/common/DesktopOnlyBadge/DesktopOnlyBadge', () => ({
  DesktopOnlyBadge: () => <span>Full options available on desktop</span>,
}));

vi.mock('../../../components/common/IconLabelButton/IconLabelButton', () => ({
  IconLabelButton: ({ label, active, onPress, className, ariaLabel, title }: {
    label?: ReactNode; active?: boolean; onPress?: () => void; className?: string;
    ariaLabel?: string; title?: string;
  }) => (
    <button type="button" className={className} aria-label={ariaLabel} title={title} aria-pressed={active} onClick={onPress}>{label}</button>
  ),
}));

function stocksWidget(config?: Record<string, unknown>): PanelWidget {
  return { id: 'stocks-1', type: 'stocks', size: '4x2', col: 0, row: 0, config: config as PanelWidget['config'] };
}

describe('StocksSettings', () => {
  it('defaults to list mode and hides the period picker', () => {
    render(<StocksSettings widget={stocksWidget()} surface="desktop" onUpdate={vi.fn()} onResize={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Graph' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByLabelText('Period')).toBeNull();
  });

  it('switches to graph mode and reveals the period picker', () => {
    const onUpdate = vi.fn();
    render(<StocksSettings widget={stocksWidget()} surface="desktop" onUpdate={onUpdate} onResize={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Graph' }));
    expect(onUpdate).toHaveBeenCalledWith({ mode: 'graph' });
  });

  it('shows the period picker when the widget is already in graph mode', () => {
    const onUpdate = vi.fn();
    render(
      <StocksSettings widget={stocksWidget({ mode: 'graph', period: '1M' })} surface="desktop" onUpdate={onUpdate} onResize={vi.fn()} />,
    );
    const select = screen.getByLabelText('Period');
    expect(select).toHaveValue('1M');
    fireEvent.change(select, { target: { value: '1Y' } });
    expect(onUpdate).toHaveBeenCalledWith({ period: '1Y' });
  });

  it('normalizes the symbols input on blur', () => {
    const onUpdate = vi.fn();
    render(<StocksSettings widget={stocksWidget()} surface="desktop" onUpdate={onUpdate} onResize={vi.fn()} />);
    const input = screen.getByPlaceholderText(DEFAULT_SYMBOLS);
    fireEvent.change(input, { target: { value: ' aapl , not a symbol , goog ' } });
    fireEvent.blur(input);
    expect(onUpdate).toHaveBeenCalledWith({ symbols: 'AAPL,GOOG' });
  });

  it('falls back to the defaults when the symbols field is cleared entirely', () => {
    const onUpdate = vi.fn();
    render(<StocksSettings widget={stocksWidget()} surface="desktop" onUpdate={onUpdate} onResize={vi.fn()} />);
    const input = screen.getByPlaceholderText(DEFAULT_SYMBOLS);
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.blur(input);
    expect(onUpdate).toHaveBeenCalledWith({ symbols: DEFAULT_SYMBOLS });
  });

  it('defaults the accent toggle off and emits the config patch when switched on', () => {
    const onUpdate = vi.fn();
    render(<StocksSettings widget={stocksWidget()} surface="desktop" onUpdate={onUpdate} onResize={vi.fn()} />);
    const toggle = screen.getByRole('switch', { name: 'Use accent color' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(toggle);
    expect(onUpdate).toHaveBeenCalledWith({ useAccentColor: true });
  });

  it('hides the free-text symbols field on a keyboard-less surface', () => {
    render(<StocksSettings widget={stocksWidget()} surface="y70" onUpdate={vi.fn()} onResize={vi.fn()} />);
    expect(screen.queryByPlaceholderText(DEFAULT_SYMBOLS)).toBeNull();
    expect(screen.getByText('Full options available on desktop')).toBeInTheDocument();
  });
});
