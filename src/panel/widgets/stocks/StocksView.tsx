import type { CSSProperties } from 'react';
import type { StockQuote } from '../../../api/stocks';
import { useTranslation } from '../../../lib/i18n';
import { Sparkline } from '../../../components/common/Sparkline/Sparkline';
import type { NumberFormat } from '../../../lib/units';
import type { PanelWidgetSize } from '../../types';
import {
  formatStockChangePercent,
  formatStockPrice,
  isStockUp,
  isWideStockSize,
  splitColumns,
  stockGraphChartHeight,
  stockGraphRows,
  stockLabel,
  stockListLayout,
  type StockDisplayMode,
} from './stocksUtils';
import styles from './StocksWidget.module.scss';

// Presentational-only render, shared by the live StocksWidget and the static
// StocksPreview catalog face - identical layout math either way, only the
// `quotes` source differs (live fetch vs a frozen fixture).

interface StocksViewProps {
  size: PanelWidgetSize;
  mode: StockDisplayMode;
  symbols: string[];
  quotes: StockQuote[] | null;
  loaded: boolean;
  numberFormat: NumberFormat;
  useAccentColor: boolean;
}

// Resolves through the root's --stock-up/--stock-down, which the .accent
// class re-points at --panel-accent.
function stockTrendColor(up: boolean): string {
  return up ? 'var(--stock-up)' : 'var(--stock-down)';
}

function ListRow({ quote, numberFormat }: { quote: StockQuote; numberFormat: NumberFormat }) {
  const hasChange = typeof quote.change === 'number' && Number.isFinite(quote.change);
  const up = isStockUp(quote.change);
  return (
    <div className={styles.listRow}>
      <span
        className={`${styles.arrow} ${hasChange ? (up ? styles.arrowUp : styles.arrowDown) : styles.arrowPlaceholder}`}
        aria-hidden="true"
      />
      <span className={styles.listLabel}>{stockLabel(quote.symbol)}</span>
      <span className={styles.listPrice}>{formatStockPrice(quote.price, numberFormat)}</span>
    </div>
  );
}

function GraphRow({ quote, numberFormat, stacked }: { quote: StockQuote; numberFormat: NumberFormat; stacked: boolean }) {
  const up = isStockUp(quote.change);
  const color = stockTrendColor(up);
  const series = quote.series ?? [];
  const chartHeight = stockGraphChartHeight(stacked);
  // Feeds both the Sparkline's viewBox math and the container's CSS height
  // from the same value, so the two can't drift apart.
  const chartStyle = { '--stock-chart-height': `${chartHeight}px` } as CSSProperties;
  const chip = (
    <span className={`${styles.chip} ${up ? styles.chipUp : styles.chipDown}`}>
      {formatStockChangePercent(quote.changePercent, numberFormat)}
    </span>
  );
  const chart = series.length > 1 && (
    <Sparkline values={series} width="100%" viewWidth={100} height={chartHeight} showFill color={color} strokeColor={color} />
  );

  // Narrow (2-wide) sizes can't fit label|chart|price on one line without
  // crushing the chart or truncating the label to a couple of characters, so
  // they stack label+price above chart+chip instead.
  if (stacked) {
    return (
      <div className={styles.graphRowStacked}>
        <div className={styles.graphStackedLine1}>
          <span className={styles.graphStackedLabel}>{stockLabel(quote.symbol)}</span>
          <span className={styles.graphStackedPrice}>{formatStockPrice(quote.price, numberFormat)}</span>
        </div>
        <div className={styles.graphStackedLine2}>
          <div className={styles.graphChart} style={chartStyle}>{chart}</div>
          {chip}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.graphRow}>
      <span className={styles.graphLabel}>{stockLabel(quote.symbol)}</span>
      <div className={styles.graphChart} style={chartStyle}>{chart}</div>
      <div className={styles.graphMeta}>
        <span className={styles.graphPrice}>{formatStockPrice(quote.price, numberFormat)}</span>
        {chip}
      </div>
    </div>
  );
}

export function StocksView({ size, mode, symbols, quotes, loaded, numberFormat, useAccentColor }: StocksViewProps) {
  const { t } = useTranslation();

  if (quotes === null) {
    return <div className={styles.empty}>{loaded ? t('panel.widget.stocks.noData') : t('common.loading')}</div>;
  }

  const bySymbol = new Map(quotes.map(q => [q.symbol, q]));
  const rows: StockQuote[] = symbols.map(symbol => bySymbol.get(symbol) ?? { symbol });

  if (mode === 'graph') {
    const visible = rows.slice(0, stockGraphRows(size));
    const stacked = !isWideStockSize(size);
    return (
      <div className={`${styles.graphRoot} ${useAccentColor ? styles.accent : ''}`}>
        {visible.map(quote => (
          <GraphRow key={quote.symbol} quote={quote} numberFormat={numberFormat} stacked={stacked} />
        ))}
      </div>
    );
  }

  const layout = stockListLayout(size);
  const visible = rows.slice(0, layout.columns * layout.rows);
  const columns = splitColumns(visible, layout.columns);
  const listClass = `${styles.listRoot} ${size === '4x4' ? styles.listLarge : ''} ${useAccentColor ? styles.accent : ''}`;
  return (
    <div className={listClass}>
      {columns.map((col, i) => (
        <div className={styles.listColumn} key={i}>
          {col.map(quote => <ListRow key={quote.symbol} quote={quote} numberFormat={numberFormat} />)}
        </div>
      ))}
    </div>
  );
}

export default StocksView;
