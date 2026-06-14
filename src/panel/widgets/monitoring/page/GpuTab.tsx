import type { HardwareSensor, SensorState } from '../../../../hooks/useSensors';
import { useTranslation } from '../../../../lib/i18n';
import { StackedChart } from '../../../../components/common/StackedChart/StackedChart';
import { RankedList } from '../../../../components/common/RankedList/RankedList';
import { useTopic } from '../../../../hooks/useMultiplexSocket';
import { useSharedSensorHistory } from '../../common/useSharedSensorHistory';
import { VitalsStrip, type Vital } from './VitalsStrip';
import styles from '../MonitoringPage.module.scss';

const N = 60;
const PROC_COLOR = '#5b8cff';

interface GpuProcess { name: string; gpuPercent: number; dedicatedMb: number; }
interface GpuProcessFrame { processes: GpuProcess[]; }

function padLeft(arr: readonly number[]): number[] {
  if (arr.length >= N) return arr.slice(-N);
  const out = new Array<number>(N).fill(0);
  const off = N - arr.length;
  for (let i = 0; i < arr.length; i++) out[off + i] = arr[i];
  return out;
}

// Cross-vendor engine breakdown: aggregate the per-engine D3D Load sensors LHM
// reports (NVIDIA + AMD both expose these, with vendor-specific sub-engines and
// sometimes several of one kind -- sum them, clamp to 100%).
const ENGINES = [
  { key: '3D', color: '#5b8cff', match: (n: string) => n === 'D3D 3D' || n === 'D3D High Priority 3D' },
  { key: 'Compute', color: '#36c5a8', match: (n: string) => n.startsWith('D3D Compute') || n === 'D3D High Priority Compute' },
  { key: 'Encode', color: '#f2a64d', match: (n: string) => n.startsWith('D3D Video Encode') },
  { key: 'Decode', color: '#c77dff', match: (n: string) => n.startsWith('D3D Video Decode') || n.startsWith('D3D Video Codec') || n.startsWith('D3D Video JPEG') },
  { key: 'Copy', color: '#9aa0aa', match: (n: string) => n.startsWith('D3D Copy') },
] as const;

function sumLoad(g: HardwareSensor[], match: (n: string) => boolean): number {
  return Math.min(100, g.filter(s => s.type === 'Load' && match(s.name)).reduce((a, s) => a + s.value, 0));
}
function val(g: HardwareSensor[], type: string, name: string): number | undefined {
  return g.find(s => s.type === type && s.name === name)?.value;
}

/**
 * GPU detail tab. Renders the picker-selected GPU's per-engine utilisation
 * (3D / Compute / Encode / Decode / Copy) and VRAM as time-series, plus a vitals
 * strip. All from the existing `gpu` topic -- no backend (per-process GPU is a
 * separate PDH-backed addition).
 */
export function GpuTab({ sensors }: { sensors: SensorState }) {
  const { t } = useTranslation();
  const g = sensors.gpu;
  const model = sensors.gpuModel;

  // Fixed set of history hooks (rules-of-hooks): one per canonical engine + VRAM.
  const h3d = useSharedSensorHistory(`gpu:${model}:3D`, sumLoad(g, ENGINES[0].match));
  const hCompute = useSharedSensorHistory(`gpu:${model}:Compute`, sumLoad(g, ENGINES[1].match));
  const hEncode = useSharedSensorHistory(`gpu:${model}:Encode`, sumLoad(g, ENGINES[2].match));
  const hDecode = useSharedSensorHistory(`gpu:${model}:Decode`, sumLoad(g, ENGINES[3].match));
  const hCopy = useSharedSensorHistory(`gpu:${model}:Copy`, sumLoad(g, ENGINES[4].match));
  const engineHist = [h3d, hCompute, hEncode, hDecode, hCopy];

  const vramUsed = val(g, 'SmallData', 'GPU Memory Used') ?? 0;
  const vramTotal = val(g, 'SmallData', 'GPU Memory Total') ?? 0;
  const hVram = useSharedSensorHistory(`gpu:${model}:vram`, vramUsed);

  // Per-process GPU (Windows PDH, vendor-agnostic). Subscribing only while this
  // tab is mounted gates the backend collector. Aggregated across both GPUs.
  const gpuProcs = useTopic<GpuProcessFrame>('gpu-processes', true);

  if (!model || g.length === 0) return null;

  const engineSeries = ENGINES.map((e, i) => {
    const values = padLeft(engineHist[i]);
    return { name: e.key, color: e.color, values, current: values[values.length - 1], avg: 0 };
  });
  const vramSeries = [{ name: 'VRAM', color: '#5b8cff', values: padLeft(hVram), current: vramUsed, avg: 0 }];

  // Overall: NVIDIA exposes a "GPU Core" load; AMD's busiest path is D3D 3D.
  const overall = Math.round(val(g, 'Load', 'GPU Core') ?? sumLoad(g, ENGINES[0].match));
  const temp = val(g, 'Temperature', 'GPU Core');
  const power = val(g, 'Power', 'GPU Package');
  const clock = val(g, 'Clock', 'GPU Core');

  const vitals: Vital[] = [
    { label: t('monitoring.vital.usage'), value: `${overall}%` },
  ];
  if (temp != null) vitals.push({ label: t('monitoring.vital.temp'), value: `${Math.round(temp)}°C` });
  if (power != null) vitals.push({ label: t('monitoring.vital.power'), value: `${Math.round(power)} W` });
  if (clock != null) vitals.push({ label: t('monitoring.vital.clock'), value: `${Math.round(clock)} MHz` });

  return (
    <>
      <VitalsStrip vitals={vitals} />
      <StackedChart
        title={t('monitoring.gpu.engines')}
        titleRight={
          <div className={styles.chartStat}>
            <span className={styles.chartStatValue}>{overall}</span>
            <span className={styles.chartStatUnit}>%</span>
          </div>
        }
        series={engineSeries}
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
        items={(gpuProcs?.processes ?? []).map(p => ({
          name: p.name,
          color: PROC_COLOR,
          value: p.gpuPercent,
          sub: p.dedicatedMb >= 1 ? `${Math.round(p.dedicatedMb)} MB` : undefined,
        }))}
        formatValue={v => `${Math.round(v)}%`}
        emptyMessage={t('monitoring.ranked.empty')}
      />
    </>
  );
}
