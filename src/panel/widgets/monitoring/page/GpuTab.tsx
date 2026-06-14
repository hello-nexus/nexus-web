import type { HardwareSensor, SensorState } from '../../../../hooks/useSensors';
import { useTranslation } from '../../../../lib/i18n';
import { StackedChart } from '../../../../components/common/StackedChart/StackedChart';
import { RankedList } from '../../../../components/common/RankedList/RankedList';
import { useGpuProcesses } from '../../../../hooks/useProcessMonitor';
import { colorFor } from '../../../../lib/monitoringStore';
import { useSharedSensorHistory } from '../../common/useSharedSensorHistory';
import { VitalsStrip, type Vital } from './VitalsStrip';
import styles from '../MonitoringPage.module.scss';

const N = 60;

function padLeft(arr: readonly number[]): number[] {
  if (arr.length >= N) return arr.slice(-N);
  const out = new Array<number>(N).fill(0);
  const off = N - arr.length;
  for (let i = 0; i < arr.length; i++) out[off + i] = arr[i];
  return out;
}

function val(g: HardwareSensor[], type: string, name: string): number | undefined {
  return g.find(s => s.type === type && s.name === name)?.value;
}
// AMD has no top-level "GPU Core" load; its busiest engine is D3D 3D.
function load3d(g: HardwareSensor[]): number {
  return Math.min(100, g
    .filter(s => s.type === 'Load' && (s.name === 'D3D 3D' || s.name === 'D3D High Priority 3D'))
    .reduce((a, s) => a + s.value, 0));
}

/**
 * GPU detail tab: vitals strip, per-process GPU utilization over time (top
 * processes, from the PDH-backed gpu-processes topic), total VRAM, and a ranked
 * "Top GPU processes" list with dedicated VRAM. Shows the picker-selected GPU.
 */
export function GpuTab({ sensors }: { sensors: SensorState }) {
  const { t } = useTranslation();
  const g = sensors.gpu;
  const model = sensors.gpuModel;

  const vramUsed = val(g, 'SmallData', 'GPU Memory Used') ?? 0;
  const vramTotal = val(g, 'SmallData', 'GPU Memory Total') ?? 0;
  const hVram = useSharedSensorHistory(`gpu:${model}:vram`, vramUsed);
  // Subscribing only while this tab is mounted gates the PDH backend collector.
  const { series: procSeries, ranked: procRanked } = useGpuProcesses(true);

  if (!model || g.length === 0) return null;

  const vramSeries = [{ name: 'VRAM', color: '#5b8cff', values: padLeft(hVram), current: vramUsed, avg: 0 }];

  const overall = Math.round(val(g, 'Load', 'GPU Core') ?? load3d(g));
  const temp = val(g, 'Temperature', 'GPU Core');
  const power = val(g, 'Power', 'GPU Package');
  const clock = val(g, 'Clock', 'GPU Core');

  const vitals: Vital[] = [{ label: t('monitoring.vital.usage'), value: `${overall}%` }];
  if (temp != null) vitals.push({ label: t('monitoring.vital.temp'), value: `${Math.round(temp)}°C` });
  if (power != null) vitals.push({ label: t('monitoring.vital.power'), value: `${Math.round(power)} W` });
  if (clock != null) vitals.push({ label: t('monitoring.vital.clock'), value: `${Math.round(clock)} MHz` });

  return (
    <>
      <VitalsStrip vitals={vitals} />
      <StackedChart
        title={t('monitoring.gpu.byProcess')}
        titleRight={
          <div className={styles.chartStat}>
            <span className={styles.chartStatValue}>{overall}</span>
            <span className={styles.chartStatUnit}>%</span>
          </div>
        }
        series={procSeries}
        sampleCount={N}
        yMax={100}
        yUnit="%"
        xSeconds={60}
      />
      <StackedChart
        title={t('monitoring.gpu.vram')}
        titleRight={
          <div className={styles.chartStat}>
            <span className={styles.chartStatValue}>{Math.round(vramUsed)}</span>
            <span className={styles.chartStatUnit}>/ {Math.round(vramTotal)} MB</span>
          </div>
        }
        series={vramSeries}
        sampleCount={N}
        yMax={vramTotal || undefined}
        yUnit="MB"
        xSeconds={60}
      />
      <RankedList
        title={t('monitoring.gpu.topProcesses')}
        subtitle={null}
        items={procRanked.map(p => ({
          name: p.name,
          color: colorFor(p.name),
          value: p.gpuPercent,
          sub: p.dedicatedMb >= 1 ? `${Math.round(p.dedicatedMb)} MB` : undefined,
        }))}
        formatValue={v => `${Math.round(v)}%`}
        emptyMessage={t('monitoring.ranked.empty')}
      />
    </>
  );
}
