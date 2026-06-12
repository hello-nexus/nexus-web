import { useMemo } from 'react';
import type { NetworkData } from '../../../../hooks/useNetworkMonitor';
import { useTranslation } from '../../../../lib/i18n';
import { NETWORK_SERIES_COLOR } from '../../../../lib/monitoringStore';
import { StackedChart } from '../../../../components/common/StackedChart/StackedChart';
import { RankedList } from '../../../../components/common/RankedList/RankedList';
import { useSharedSensorHistory } from '../../common/useSharedSensorHistory';
import { RankedToggle } from './parts';
import { formatDataSize, formatRate, formatRateParts } from './shared';
import styles from '../MonitoringPage.module.scss';

const SAMPLE_COUNT = 60;

function padLeft(arr: readonly number[]): number[] {
  if (arr.length >= SAMPLE_COUNT) return arr.slice(-SAMPLE_COUNT);
  const out = new Array<number>(SAMPLE_COUNT).fill(0);
  const offset = SAMPLE_COUNT - arr.length;
  for (let i = 0; i < arr.length; i++) out[offset + i] = arr[i];
  return out;
}

function niceNetworkCeiling(value: number): number {
  if (!isFinite(value) || value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const magnitude = 10 ** exponent;
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1
    : normalized <= 2 ? 2
    : normalized <= 5 ? 5
    : 10;
  return step * magnitude;
}

export function NetworkTab({ network, showAverage, onToggle }: {
  network: NetworkData;
  showAverage: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();

  // Chart series tracks the Network Total sensor (B/s → KB/s for the chart's
  // KB/s→MB/s formatter). Per-process series stays in the ranked list below.
  const totalKBs = network.totalRate / 1024;
  const history = useSharedSensorHistory('network::Network Total KBs', totalKBs);

  const series = useMemo(() => {
    const values = padLeft(history);
    const sum = history.reduce((a, b) => a + b, 0);
    return [{
      name: 'Network Total',
      color: NETWORK_SERIES_COLOR,
      values,
      current: totalKBs,
      avg: history.length > 0 ? sum / history.length : 0,
    }];
  }, [history, totalKBs]);

  // Match the chart's auto-scale to the panel's NETWORK_SENSOR_TOTAL gauge so
  // a quiet network still draws a usable y-axis (≥1 KB/s minimum ceiling).
  const yMax = useMemo(() => {
    const peak = Math.max(1, totalKBs, ...history);
    return niceNetworkCeiling(peak);
  }, [history, totalKBs]);

  const entryRanked = [...network.entries].sort((a, b) => b.rateTotal - a.rateTotal);
  const items = showAverage
    ? [...network.series]
        .sort((a, b) => {
          const sumA = a.values.reduce((x, y) => x + y, 0);
          const sumB = b.values.reduce((x, y) => x + y, 0);
          return sumB - sumA;
        })
        .map(s => ({ name: s.name, color: s.color, value: s.values.reduce((x, y) => x + y, 0) }))
    : entryRanked.map(e => ({ name: e.name, color: e.color, value: e.rateTotal }));

  const totalIn = network.entries.reduce((s, e) => s + e.rateIn, 0);
  const totalOut = network.entries.reduce((s, e) => s + e.rateOut, 0);
  const inParts = formatRateParts(totalIn);
  const outParts = formatRateParts(totalOut);

  return (
    <>
      <StackedChart
        title={t('monitoring.network.title')}
        titleRight={
          <>
            <div className={styles.chartStat}>
              <span className={styles.chartStatArrow}>↓</span>
              <span className={styles.chartStatValue}>{inParts.value}</span>
              <span className={styles.chartStatUnit}>{inParts.unit}</span>
            </div>
            <div className={styles.chartStat}>
              <span className={styles.chartStatArrow}>↑</span>
              <span className={styles.chartStatValue}>{outParts.value}</span>
              <span className={styles.chartStatUnit}>{outParts.unit}</span>
            </div>
          </>
        }
        series={series}
        sampleCount={SAMPLE_COUNT}
        yMax={yMax}
        // eslint-disable-next-line i18next/no-literal-string -- data-rate unit
        yUnit="KB/s"
        xSeconds={60}
      />
      <RankedList
        title={t('monitoring.network.top')}
        subtitle={<RankedToggle showAverage={showAverage} onToggle={onToggle} />}
        items={items}
        formatValue={showAverage ? formatDataSize : formatRate}
        emptyMessage={t('monitoring.ranked.empty')}
      />
    </>
  );
}
