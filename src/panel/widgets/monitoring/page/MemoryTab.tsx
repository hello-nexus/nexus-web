import { useMemo } from 'react';
import type { useProcessMonitor } from '../../../../hooks/useProcessMonitor';
import type { SensorState } from '../../../../hooks/useSensors';
import { useTranslation } from '../../../../lib/i18n';
import { StackedChart } from '../../../../components/common/StackedChart/StackedChart';
import { RankedList } from '../../../../components/common/RankedList/RankedList';
import { useSharedSensorHistory } from '../../common/useSharedSensorHistory';
import { RankedToggle } from './parts';
import { rankSeries } from './shared';
import styles from '../MonitoringPage.module.scss';

const SAMPLE_COUNT = 60;

function padLeft(arr: readonly number[]): number[] {
  if (arr.length >= SAMPLE_COUNT) return arr.slice(-SAMPLE_COUNT);
  const out = new Array<number>(SAMPLE_COUNT).fill(0);
  const offset = SAMPLE_COUNT - arr.length;
  for (let i = 0; i < arr.length; i++) out[offset + i] = arr[i];
  return out;
}

export function MemoryTab({ memSeries, sensors, systemMemMb, showAverage, onToggle }: {
  memSeries: ReturnType<typeof useProcessMonitor>['memSeries'];
  sensors: SensorState;
  systemMemMb: number;
  showAverage: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();

  // LHM "Memory Used" reports GB; convert to MB so the chart's MB→GB axis
  // formatter (kicks in at yMax≥1024) lines up with the per-process units used
  // in the ranked list below.
  const memUsedSensor = sensors.memory.find(s => s.name === 'Memory Used');
  const usedMb = memUsedSensor ? memUsedSensor.value * 1024 : 0;
  const history = useSharedSensorHistory('memory::Memory Used MB', usedMb);

  const series = useMemo(() => {
    const values = padLeft(history);
    const sum = history.reduce((a, b) => a + b, 0);
    return [{
      name: 'Memory Used',
      color: '#a78bfa',
      values,
      current: usedMb,
      avg: history.length > 0 ? sum / history.length : 0,
    }];
  }, [history, usedMb]);

  const { ranked, key } = rankSeries(memSeries, showAverage);

  const usedGb = (usedMb / 1024).toFixed(1);

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
        series={series}
        sampleCount={SAMPLE_COUNT}
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
