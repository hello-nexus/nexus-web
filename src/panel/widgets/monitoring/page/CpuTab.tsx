import type { useProcessMonitor } from '../../../../hooks/useProcessMonitor';
import type { HardwareSensor, SensorState } from '../../../../hooks/useSensors';
import { useUnitPrefs } from '../../../../hooks/useUiSettings';
import { useTranslation } from '../../../../lib/i18n';
import { StackedChart } from '../../../../components/common/StackedChart/StackedChart';
import { RankedList } from '../../../../components/common/RankedList/RankedList';
import { convertTemperature, localizeNumbers, tempUnitSymbol } from '../../../../lib/units';
import { VitalsStrip, type Vital } from './VitalsStrip';
import { RankedToggle } from './parts';
import { rankSeries, topNWithOther } from './shared';
import styles from '../MonitoringPage.module.scss';

const SAMPLE_COUNT = 60;

function pick(sensors: HardwareSensor[], type: string, names: string[]): number | undefined {
  for (const n of names) {
    const s = sensors.find(x => x.type === type && x.name === n);
    if (s) return s.value;
  }
  return sensors.find(x => x.type === type)?.value;
}

export function CpuTab({ cpuSeries, sensors, showAverage, onToggle }: {
  cpuSeries: ReturnType<typeof useProcessMonitor>['cpuSeries'];
  sensors: SensorState;
  showAverage: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const { monitoringTempUnit, numberFormat } = useUnitPrefs();

  // No `?? sensors.cpu[0]` fallback: the first sensor could be a temperature
  // in °C, which would render as a percentage. Show 0 when 'CPU Total' absent.
  const cpuTotalSensor = sensors.cpu.find(s => s.name === 'CPU Total');
  const cpuValue = cpuTotalSensor?.value ?? 0;

  const chartSeries = topNWithOther(cpuSeries, 5);
  const { ranked, key } = rankSeries(cpuSeries, showAverage);

  const temp = pick(sensors.cpu, 'Temperature', ['CPU Package', 'Core (Tctl/Tdie)', 'Core (Tctl)']);
  const power = pick(sensors.cpu, 'Power', ['CPU Package', 'Package']);
  const clock = pick(sensors.cpu, 'Clock', ['Cores (Average)']);
  const vitals: Vital[] = [{ label: t('monitoring.vital.usage'), value: localizeNumbers(`${Math.round(cpuValue)}%`, numberFormat) }];
  if (temp != null) vitals.push({ label: t('monitoring.vital.temp'), value: localizeNumbers(`${Math.round(convertTemperature(temp, monitoringTempUnit))}${tempUnitSymbol(monitoringTempUnit)}`, numberFormat) });
  if (power != null) vitals.push({ label: t('monitoring.vital.power'), value: localizeNumbers(`${Math.round(power)} W`, numberFormat) });
  if (clock != null) vitals.push({ label: t('monitoring.vital.clock'), value: localizeNumbers(`${Math.round(clock)} MHz`, numberFormat) });

  return (
    <>
      {sensors.cpuModel && (
        <div className={styles.tabHeader}>
          <span className={styles.tabHeaderName}>{sensors.cpuModel}</span>
        </div>
      )}
      <VitalsStrip vitals={vitals} />
      <StackedChart
        title={t('monitoring.tab.cpu')}
        titleRight={
          <div className={styles.chartStat}>
            <span className={styles.chartStatValue}>{localizeNumbers(String(Math.round(cpuValue)), numberFormat)}</span>
            <span className={styles.chartStatUnit}>%</span>
          </div>
        }
        series={chartSeries}
        sampleCount={SAMPLE_COUNT}
        yMax={100}
        yUnit="%"
        xSeconds={60}
      />
      <RankedList
        title={t('monitoring.cpu.top')}
        subtitle={<RankedToggle showAverage={showAverage} onToggle={onToggle} />}
        items={ranked.map(s => ({ name: s.name, color: s.color, value: s[key] }))}
        formatValue={(v) => localizeNumbers(`${(+v).toFixed(1)}%`, numberFormat)}
        emptyMessage={t('monitoring.ranked.empty')}
      />
    </>
  );
}
