import type { HardwareSensor, SensorState } from '../../../../hooks/useSensors';
import { useTranslation } from '../../../../lib/i18n';
import { StackedChart } from '../../../../components/common/StackedChart/StackedChart';
import { RankedList } from '../../../../components/common/RankedList/RankedList';
import { Select, type SelectOption } from '../../../../components/common/Select/Select';
import { useGpuProcessData } from '../../../../hooks/useProcessMonitor';
import { colorFor } from '../../../../lib/monitoringStore';
import { resolvePrimaryGpu } from '../../../../lib/gpuResolver';
import { VitalsStrip, type Vital } from './VitalsStrip';
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

/**
 * GPU detail tab: vitals strip, then GPU usage and VRAM side by side, both
 * broken down per process (top processes from the PDH-backed gpu-processes
 * topic), and a ranked "Top GPU processes" list. Shows the picker-selected GPU.
 */
export function GpuTab({ sensors, preferredGpuId, onGpuChange }: {
  sensors: SensorState;
  preferredGpuId: string;
  onGpuChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const g = sensors.gpu;
  const model = sensors.gpuModel;
  const gpus = sensors.gpuComponents;

  const vramUsed = val(g, 'SmallData', 'GPU Memory Used') ?? 0;
  const vramTotal = val(g, 'SmallData', 'GPU Memory Total') ?? 0;
  // Feed is mounted at page level; here we only read the accumulated history.
  const { utilSeries, memSeries, ranked: procRanked } = useGpuProcessData();

  if (!model || g.length === 0) return null;

  const overall = Math.round(val(g, 'Load', 'GPU Core') ?? load3d(g));
  const temp = val(g, 'Temperature', 'GPU Core');
  const power = val(g, 'Power', 'GPU Package');
  const clock = val(g, 'Clock', 'GPU Core');

  const vitals: Vital[] = [{ label: t('monitoring.vital.usage'), value: `${overall}%` }];
  if (temp != null) vitals.push({ label: t('monitoring.vital.temp'), value: `${Math.round(temp)}°C` });
  if (power != null) vitals.push({ label: t('monitoring.vital.power'), value: `${Math.round(power)} W` });
  if (clock != null) vitals.push({ label: t('monitoring.vital.clock'), value: `${Math.round(clock)} MHz` });

  const autoName = resolvePrimaryGpu(gpus, '')?.name ?? '';
  const gpuOptions: SelectOption[] = [
    { value: '', label: t('monitoring.gpuSelect.auto', { name: autoName }) },
    ...gpus.map(gp => ({
      value: gp.name,
      label: gp.integrated ? `${gp.name} (${t('monitoring.gpuSelect.integrated')})` : gp.name,
    })),
  ];

  return (
    <>
      <div className={styles.tabHeader}>
        {gpus.length > 1 ? (
          <Select
            className={styles.tabHeaderPicker}
            value={preferredGpuId}
            onChange={onGpuChange}
            options={gpuOptions}
            ariaLabel={t('monitoring.gpuSelect.label')}
            variant="ghost"
          />
        ) : (
          <span className={styles.tabHeaderName}>{model}</span>
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
          series={utilSeries}
          sampleCount={N}
          yMax={100}
          yUnit="%"
          xSeconds={60}
        />
        <StackedChart
          title={t('monitoring.gpu.memByProcess')}
          titleRight={
            <div className={styles.chartStat}>
              <span className={styles.chartStatValue}>{Math.round(vramUsed)}</span>
              <span className={styles.chartStatUnit}>/ {Math.round(vramTotal)} MB</span>
            </div>
          }
          series={memSeries}
          sampleCount={N}
          yMax={vramTotal || undefined}
          yUnit="MB"
          xSeconds={60}
        />
      </div>
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
