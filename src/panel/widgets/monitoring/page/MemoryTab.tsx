import type { useProcessMonitor } from '../../../../hooks/useProcessMonitor';
import type { SensorState } from '../../../../hooks/useSensors';
import { useTranslation } from '../../../../lib/i18n';
import { StackedChart } from '../../../../components/common/StackedChart/StackedChart';
import { RankedList } from '../../../../components/common/RankedList/RankedList';
import { RankedToggle } from './parts';
import { rankSeries, topNWithOther } from './shared';
import styles from '../MonitoringPage.module.scss';

const SAMPLE_COUNT = 60;

export function MemoryTab({ memSeries, sensors, showAverage, onToggle }: {
  memSeries: ReturnType<typeof useProcessMonitor>['memSeries'];
  sensors: SensorState;
  showAverage: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();

  // LHM "Memory Used" reports GB; convert to MB so the chart's MB→GB axis
  // formatter (kicks in at yMax≥1024) lines up with the per-process units used
  // in the ranked list below. `theoreticalMaximum` carries installed RAM in GB.
  const memUsedSensor = sensors.memory.find(s => s.name === 'Memory Used');
  const usedMb = memUsedSensor ? memUsedSensor.value * 1024 : 0;
  const totalMb = memUsedSensor?.theoreticalMaximum ? memUsedSensor.theoreticalMaximum * 1024 : 0;

  const chartSeries = topNWithOther(memSeries, 5);
  const { ranked, key } = rankSeries(memSeries, showAverage);

  const usedGb = (usedMb / 1024).toFixed(1);

  return (
    <>
      <StackedChart
        title={t('monitoring.mem.title.plain')}
        titleRight={totalMb > 0 ? (
          <div className={styles.chartStat}>
            <span className={styles.chartStatValue}>{usedGb}</span>
            <span className={styles.chartStatUnit}>{`/ ${(totalMb / 1024).toFixed(0)} GB`}</span>
          </div>
        ) : undefined}
        series={chartSeries}
        sampleCount={SAMPLE_COUNT}
        yMax={totalMb > 0 ? totalMb : undefined}
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
