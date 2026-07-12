import type { NumberFormat } from '../../../lib/units';
import type { WidgetProps } from '../types';
import { STOCKS_PREVIEW } from './stocksPreviewData';
import { StocksView } from './StocksView';

// Static catalog face for the native Stocks widget. Renders the real list
// layout from a fixed fixture - no fetch, no config read - so the
// Add-a-Widget picker shows a real stocks tile without any I/O. Always shows
// the default list mode, matching a freshly-added widget's defaultConfig.
// Pinned to 'dot' rather than the live 'system' preference (like
// WeatherPreview's fixed unit) so the catalog tile renders identically
// regardless of the host locale.
const numberFormat: NumberFormat = 'dot';

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
      useAccentColor={false}
    />
  );
}

export default StocksPreview;
