import type { useProcessMonitor } from '../../../../hooks/useProcessMonitor';
import { useTranslation } from '../../../../lib/i18n';
import { StackedChart } from '../../../../components/common/StackedChart/StackedChart';
import { RankedList } from '../../../../components/common/RankedList/RankedList';
import { RankedToggle } from './parts';
import { rankSeries } from './shared';
import styles from '../MonitoringPage.module.scss';

export function CpuTab({ cpuSeries, sampleCount, totalCpu, showAverage, onToggle }: {
  cpuSeries: ReturnType<typeof useProcessMonitor>['cpuSeries'];
  sampleCount: number;
  totalCpu: number;
  showAverage: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();

  const displayCpu = totalCpu > 0
    ? totalCpu
    : cpuSeries.reduce((s, e) => s + e.current, 0);

  const { ranked, key } = rankSeries(cpuSeries, showAverage);

  return (
    <>
      <StackedChart
        title={t('monitoring.tab.cpu')}
        titleRight={
          <div className={styles.chartStat}>
            <span className={styles.chartStatValue}>{Math.round(displayCpu)}</span>
            <span className={styles.chartStatUnit}>%</span>
          </div>
        }
        series={cpuSeries}
        sampleCount={sampleCount}
        yMax={100}
        yUnit="%"
        xSeconds={60}
      />
      <RankedList
        title={t('monitoring.cpu.top')}
        subtitle={<RankedToggle showAverage={showAverage} onToggle={onToggle} />}
        items={ranked.map(s => ({ name: s.name, color: s.color, value: s[key] }))}
        formatValue={(v) => `${(+v).toFixed(1)}%`}
        emptyMessage={t('monitoring.ranked.empty')}
      />
    </>
  );
}
