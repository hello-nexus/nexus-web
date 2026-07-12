import { useEffect, useMemo, useState } from 'react';
import { fetchStockQuotes, type StockQuote } from '../../../api/stocks';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { usePanelPreview } from '../common/PanelPreviewContext';
import type { WidgetProps } from '../types';
import { resolveMode, resolvePeriod, resolveSymbols } from './stocksUtils';
import { StocksView } from './StocksView';

const REFRESH_MS = 60 * 1000;

export function StocksWidget({ widget }: WidgetProps) {
  const { numberFormat } = useUnitPrefs();
  const preview = usePanelPreview();

  const mode = resolveMode(widget.config?.mode);
  const configuredPeriod = resolvePeriod(widget.config?.period);
  // List mode always shows the daily arrow regardless of the graph-only
  // period setting.
  const period = mode === 'list' ? '1D' : configuredPeriod;
  const symbolsRaw = widget.config?.symbols as string | undefined;
  const symbols = useMemo(() => resolveSymbols(symbolsRaw), [symbolsRaw]);

  const [quotes, setQuotes] = useState<StockQuote[] | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    async function load() {
      const data = await fetchStockQuotes(symbols, period);
      if (cancelled) return;
      // A failed fetch returns null - keep the last-known quotes on screen.
      if (data) setQuotes(data.quotes);
      setLoaded(true);
    }
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [preview, symbols, period]);

  return (
    <StocksView
      size={widget.size}
      mode={mode}
      symbols={symbols}
      quotes={quotes}
      loaded={loaded}
      numberFormat={numberFormat}
    />
  );
}

export default StocksWidget;
