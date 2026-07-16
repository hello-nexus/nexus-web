import type { HardwareSensor, SensorState } from '../../../../hooks/useSensors';
import { useUnitPrefs } from '../../../../hooks/useUiSettings';
import { useTranslation } from '../../../../lib/i18n';
import { useGpuProcessData } from '../../../../hooks/useProcessMonitor';
import { resolvePrimaryGpu } from '../../../../lib/gpuResolver';
import { convertTemperature, localizeNumbers, tempUnitSymbol } from '../../../../lib/units';
import { VitalsStrip, type Vital } from './VitalsStrip';
import { ProcessListSection, type ProcessListItem } from './ProcessListSection';
import { formatMemoryMb } from '../../../../lib/formatMemory';
import styles from '../MonitoringPage.module.scss';

function val(g: HardwareSensor[], type: string, name: string): number | undefined {
  return g.find(s => s.type === type && s.name === name)?.value;
}
// AMD has no top-level "GPU Core" load; its busiest engine is D3D 3D.
function load3d(g: HardwareSensor[]): number {
  return Math.min(100, g
    .filter(s => s.type === 'Load' && (s.name === 'D3D 3D' || s.name === 'D3D High Priority 3D'))
    .reduce((a, s) => a + s.value, 0));
}

export function GpuTab({ sensors, preferredGpuId, onOpenSettings }: {
  sensors: SensorState;
  preferredGpuId: string;
  onOpenSettings: () => void;
}) {
  const { t } = useTranslation();
  const { monitoringTempUnit, numberFormat } = useUnitPrefs();
  const g = sensors.gpu;
  const model = sensors.gpuModel;
  const gpus = sensors.gpuComponents;

  const selectedLuid = resolvePrimaryGpu(gpus, preferredGpuId)?.adapterLuid ?? '';
  const { procSeries, procMemSeries } = useGpuProcessData(selectedLuid);
  const vramByName = new Map(procMemSeries.map(s => [s.name, s.current]));

  if (!model || g.length === 0) return null;

  const overall = Math.round(val(g, 'Load', 'GPU Core') ?? load3d(g));
  const temp = val(g, 'Temperature', 'GPU Core');
  const power = val(g, 'Power', 'GPU Package');
  const clock = val(g, 'Clock', 'GPU Core');

  const vitals: Vital[] = [{ label: t('monitoring.vital.usage'), value: localizeNumbers(`${overall}%`, numberFormat) }];
  if (temp != null) vitals.push({ label: t('monitoring.vital.temp'), value: localizeNumbers(`${Math.round(convertTemperature(temp, monitoringTempUnit))}${tempUnitSymbol(monitoringTempUnit)}`, numberFormat) });
  if (power != null) vitals.push({ label: t('monitoring.vital.power'), value: localizeNumbers(`${Math.round(power)} W`, numberFormat) });
  if (clock != null) vitals.push({ label: t('monitoring.vital.clock'), value: localizeNumbers(`${Math.round(clock)} MHz`, numberFormat) });

  const items: ProcessListItem[] = procSeries.map(s => {
    const vram = vramByName.get(s.name) ?? 0;
    return {
      name: s.name === 'Other' ? t('monitoring.other') : s.name,
      color: s.color,
      current: s.current,
      values: s.values,
      secondary: vram >= 1 ? formatMemoryMb(vram, numberFormat) : undefined,
    };
  });

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
      <ProcessListSection items={items} formatValue={v => localizeNumbers(`${Math.round(v)}%`, numberFormat)} />
    </>
  );
}
