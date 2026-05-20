import type { useProcessMonitor } from '../../../hooks/useProcessMonitor';
import { useTranslation } from '../../../lib/i18n';
import { StackedChart } from '../../common/StackedChart/StackedChart';
import { RankedList } from '../../common/RankedList/RankedList';
import { RankedToggle } from './parts';
import { rankSeries } from './shared';
import styles from './MonitoringView.module.scss';

export function MemoryTab({ memSeries, sampleCount, systemMemMb, showAverage, onToggle }: {
  memSeries: ReturnType<typeof useProcessMonitor>['memSeries'];
  sampleCount: number;
  systemMemMb: number;
  showAverage: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();

  const usedMb = memSeries.reduce((s, e) => s + e.current, 0);
  const usedGb = (usedMb / 1024).toFixed(1);

  const { ranked, key } = rankSeries(memSeries, showAverage);

  return (
    <>
      <StackedChart
        title={t('monitoring.mem.title.plain')}
        titleRight={systemMemMb > 0 ? (
          <div className={styles.chartStat}>
            <span className={styles.chartStatValue}>{usedGb}</span>
            <span className={styles.chartStatUnit}>{`/ ${(systemMemMb / 1024).toFixed(0)} GB`}</span>
          </div>
        ) : undefined}
        series={memSeries}
        sampleCount={sampleCount}
        yMax={systemMemMb > 0 ? systemMemMb : undefined}
        yUnit="MB"
        xSeconds={60}
      />
      <RankedList
        title={t('monitoring.mem.top')}
        subtitle={<RankedToggle showAverage={showAverage} onToggle={onToggle} />}
        items={ranked.map(s => ({ name: s.name, color: s.color, value: s[key] }))}
        formatValue={(v) => `${v.toFixed(0)} MB`}
        emptyMessage={t('monitoring.ranked.empty')}
      />
    </>
  );
}
