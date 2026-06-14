import { useMemo } from 'react';
import type { useProcessMonitor } from '../../../../hooks/useProcessMonitor';
import type { HardwareSensor, SensorState } from '../../../../hooks/useSensors';
import { useTranslation } from '../../../../lib/i18n';
import { CPU_SERIES_COLOR } from '../../../../lib/monitoringStore';
import { StackedChart } from '../../../../components/common/StackedChart/StackedChart';
import { RankedList } from '../../../../components/common/RankedList/RankedList';
import { useSharedSensorHistory } from '../../common/useSharedSensorHistory';
import { VitalsStrip, type Vital } from './VitalsStrip';
import { RankedToggle } from './parts';
import { rankSeries } from './shared';
import styles from '../MonitoringPage.module.scss';

const SAMPLE_COUNT = 60;

// First sensor of `type` matching a preferred name, else any of that type.
function pick(sensors: HardwareSensor[], type: string, names: string[]): number | undefined {
  for (const n of names) {
    const s = sensors.find(x => x.type === type && x.name === n);
    if (s) return s.value;
  }
  return sensors.find(x => x.type === type)?.value;
}

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

  // No `?? sensors.cpu[0]` fallback: the first sensor could be a temperature
  // in °C, which would render as a percentage. Show 0 when 'CPU Total' absent.
  const cpuTotalSensor = sensors.cpu.find(s => s.name === 'CPU Total');
  const cpuValue = cpuTotalSensor?.value ?? 0;
  const history = useSharedSensorHistory('cpu::CPU Total', cpuValue);

  const series = useMemo(() => {
    const values = padLeft(history);
    const sum = history.reduce((a, b) => a + b, 0);
    return [{
      name: 'CPU Total',
      color: CPU_SERIES_COLOR,
      values,
      current: cpuValue,
      avg: history.length > 0 ? sum / history.length : 0,
    }];
  }, [history, cpuValue]);

  const { ranked, key } = rankSeries(cpuSeries, showAverage);

  const temp = pick(sensors.cpu, 'Temperature', ['CPU Package', 'Core (Tctl/Tdie)', 'Core (Tctl)']);
  const power = pick(sensors.cpu, 'Power', ['CPU Package', 'Package']);
  const clock = pick(sensors.cpu, 'Clock', ['Cores (Average)']);
  const vitals: Vital[] = [{ label: t('monitoring.vital.usage'), value: `${Math.round(cpuValue)}%` }];
  if (temp != null) vitals.push({ label: t('monitoring.vital.temp'), value: `${Math.round(temp)}°C` });
  if (power != null) vitals.push({ label: t('monitoring.vital.power'), value: `${Math.round(power)} W` });
  if (clock != null) vitals.push({ label: t('monitoring.vital.clock'), value: `${Math.round(clock)} MHz` });

  return (
    <>
      <VitalsStrip vitals={vitals} />
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
