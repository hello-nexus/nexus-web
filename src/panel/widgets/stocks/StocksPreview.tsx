import type { NumberFormat } from '../../../lib/units';
import type { WidgetProps } from '../types';
import { STOCKS_PREVIEW } from './stocksPreviewData';
import { StocksView } from './StocksView';

// Static catalog face for the native Stocks widget. Renders the real list
// layout from a fixed fixture - no fetch, no config read - so the
// Add-a-Widget picker shows a real stocks tile without any I/O. Always shows
// the default list mode, matching a freshly-added widget's defaultConfig.
const numberFormat: NumberFormat = 'system';

export function StocksPreview({ widget }: WidgetProps) {
  const symbols = STOCKS_PREVIEW.map(q => q.symbol);
  return (
    <StocksView
      size={widget.size}
      mode="list"
      symbols={symbols}
      quotes={STOCKS_PREVIEW}
      loaded
      numberFormat={numberFormat}
    />
  );
}

export default StocksPreview;
