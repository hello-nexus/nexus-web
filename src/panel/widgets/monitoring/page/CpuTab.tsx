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

export function CpuTab({ cpuSeries, sensors, showAverage, onToggle }: {
  cpuSeries: ReturnType<typeof useProcessMonitor>['cpuSeries'];
  sensors: SensorState;
  showAverage: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();

  // No `?? sensors.cpu[0]` fallback: if 'CPU Total' isn't present we'd silently
  // pick whichever sensor is first (could be a temperature in °C) and render it
  // as a percentage. Better to show 0 than misleading data.
  const cpuTotalSensor = sensors.cpu.find(s => s.name === 'CPU Total');
  const cpuValue = cpuTotalSensor?.value ?? 0;
  const history = useSharedSensorHistory('cpu::CPU Total', cpuValue);

  const series = useMemo(() => {
    const values = padLeft(history);
    const sum = history.reduce((a, b) => a + b, 0);
    return [{
      name: 'CPU Total',
      color: '#22d3ee',
      values,
      current: cpuValue,
      avg: history.length > 0 ? sum / history.length : 0,
    }];
  }, [history, cpuValue]);

  const { ranked, key } = rankSeries(cpuSeries, showAverage);

  return (
    <>
      <StackedChart
        title={t('monitoring.tab.cpu')}
        titleRight={
          <div className={styles.chartStat}>
            <span className={styles.chartStatValue}>{Math.round(cpuValue)}</span>
            <span className={styles.chartStatUnit}>%</span>
          </div>
        }
        series={series}
        sampleCount={SAMPLE_COUNT}
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
