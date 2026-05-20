import type { NetworkData } from '../../../hooks/useNetworkMonitor';
import { useTranslation } from '../../../lib/i18n';
import { StackedChart } from '../../common/StackedChart/StackedChart';
import { RankedList } from '../../common/RankedList/RankedList';
import { RankedToggle } from './parts';
import { formatDataSize, formatRate, formatRateParts } from './shared';
import styles from './MonitoringView.module.scss';

export function NetworkTab({ network, showAverage, onToggle }: {
  network: NetworkData;
  showAverage: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();

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
        series={network.series}
        sampleCount={network.sampleCount}
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
