import type { HardwareSensor, SensorState } from '../../../../hooks/useSensors';
import { useTranslation } from '../../../../lib/i18n';
import { StackedChart } from '../../../../components/common/StackedChart/StackedChart';
import { RankedList } from '../../../../components/common/RankedList/RankedList';
import { useGpuProcessData } from '../../../../hooks/useProcessMonitor';
import { resolvePrimaryGpu } from '../../../../lib/gpuResolver';
import { VitalsStrip, type Vital } from './VitalsStrip';
import { RankedToggle } from './parts';
import { rankSeries, topNWithOther } from './shared';
import { formatMemoryMb, formatMemoryPair } from '../../../../lib/formatMemory';
import styles from '../MonitoringPage.module.scss';

const N = 60;

function val(g: HardwareSensor[], type: string, name: string): number | undefined {
  return g.find(s => s.type === type && s.name === name)?.value;
}
// AMD has no top-level "GPU Core" load; its busiest engine is D3D 3D.
function load3d(g: HardwareSensor[]): number {
  return Math.min(100, g
    .filter(s => s.type === 'Load' && (s.name === 'D3D 3D' || s.name === 'D3D High Priority 3D'))
    .reduce((a, s) => a + s.value, 0));
}

export function GpuTab({ sensors, preferredGpuId, onOpenSettings, showAverage, onToggle }: {
  sensors: SensorState;
  preferredGpuId: string;
  onOpenSettings: () => void;
  showAverage: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const g = sensors.gpu;
  const model = sensors.gpuModel;
  const gpus = sensors.gpuComponents;

  const vramUsed = val(g, 'SmallData', 'GPU Memory Used') ?? 0;
  const vramTotal = val(g, 'SmallData', 'GPU Memory Total') ?? 0;
  const vramHeadline = formatMemoryPair(vramUsed, vramTotal);
  // Scope the per-process charts to the picked GPU's adapter (so e.g. the iGPU
  // view doesn't include the dGPU's VRAM); "" falls back to all adapters. Feed
  // is mounted at page level; here we only read the accumulated history.
  const selectedLuid = resolvePrimaryGpu(gpus, preferredGpuId)?.adapterLuid ?? '';
  const { procSeries, procMemSeries } = useGpuProcessData(selectedLuid);
  const { ranked, key } = rankSeries(procSeries, showAverage);
  // VRAM sub follows the same live/60s key as the GPU% it sits next to.
  const vramByName = new Map(procMemSeries.map(s => [s.name, s[key]]));

  if (!model || g.length === 0) return null;

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
      <div className={styles.tabHeader}>
        <span className={styles.tabHeaderName}>{model}</span>
        {gpus.length > 1 && (
          <button type="button" className={styles.tabHeaderChange} onClick={onOpenSettings}>
            {t('monitoring.gpu.change')}
          </button>
        )}
      </div>
      <VitalsStrip vitals={vitals} />
      <div className={styles.chartRow}>
        <StackedChart
          title={t('monitoring.gpu.byProcess')}
          titleRight={
            <div className={styles.chartStat}>
              <span className={styles.chartStatValue}>{overall}</span>
              <span className={styles.chartStatUnit}>%</span>
            </div>
          }
          series={topNWithOther(procSeries, 5)}
          sampleCount={N}
          yMax={100}
          yUnit="%"
          xSeconds={60}
        />
        <StackedChart
          title={t('monitoring.gpu.memByProcess')}
          titleRight={
            <div className={styles.chartStat}>
              <span className={styles.chartStatValue}>{vramHeadline.used}</span>
              <span className={styles.chartStatUnit}>/ {vramHeadline.total} {vramHeadline.unit}</span>
            </div>
          }
          series={topNWithOther(procMemSeries, 5)}
          sampleCount={N}
          yMax={vramTotal || undefined}
          yUnit="MB"
          xSeconds={60}
        />
      </div>
      <RankedList
        title={t('monitoring.gpu.topProcesses')}
        subtitle={<RankedToggle showAverage={showAverage} onToggle={onToggle} />}
        items={ranked.map(s => {
          const vram = vramByName.get(s.name) ?? 0;
          return {
            name: s.name,
            color: s.color,
            value: s[key],
            sub: vram >= 1 ? formatMemoryMb(vram) : undefined,
          };
        })}
        formatValue={v => `${Math.round(v)}%`}
        emptyMessage={t('monitoring.ranked.empty')}
      />
    </>
  );
}
