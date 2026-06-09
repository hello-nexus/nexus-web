import type { MonitoringFrame } from '../../../../hooks/useMonitoringFrame';
import { useTranslation } from '../../../../lib/i18n';
import { useUiSettings } from '../../../../hooks/useUiSettings';
import { resolveCpuTempSensor, resolveGpuTempSensor } from '../../../../lib/tempSensorResolver';
import { resolvePrimaryGpu } from '../../../../lib/gpuResolver';
import { getGpuHist } from '../../../../lib/monitoringStore';
import { Sparkline } from '../../../../components/common/Sparkline/Sparkline';
import { UsageBar } from '../../../../components/common/UsageBar/UsageBar';
import { formatMemoryPercent, formatPercentParts, formatRate, formatRateParts } from './shared';
import styles from '../MonitoringPage.module.scss';

export interface OverviewHist {
  cpu: number[]; gpu: number[]; mem: number[]; netDown: number[]; netUp: number[];
}

export function OverviewTab({ frame, hist, onNavigate }: {
  frame: MonitoringFrame | null;
  hist: OverviewHist;
  onNavigate: (tab: string) => void;
}) {
  const { t } = useTranslation();
  const { settings } = useUiSettings();

  const cpuSensors = frame?.cpu?.sensors ?? [];
  const primaryGpu = resolvePrimaryGpu(frame?.gpu ?? [], settings.preferredGpuId);
  const gpuSensors = primaryGpu?.sensors ?? [];
  const gpuName = primaryGpu?.name ?? frame?.gpuModels?.[0] ?? '';
  const memorySensors = frame?.memory?.sensors ?? [];
  const storageComponents = frame?.storage ?? {};
  const processes = frame?.processes;
  const network = frame?.network;

  const findSensor = (list: typeof cpuSensors, id: string) => list.find(s => s.id.includes(id));
  const cpuTemp = resolveCpuTempSensor(cpuSensors, settings.preferredCpuTempSensorId);
  const cpuCores = findSensor(cpuSensors, 'cores');
  const gpuLoad = findSensor(gpuSensors, 'load');
  const gpuTemp = resolveGpuTempSensor(gpuSensors, settings.preferredGpuTempSensorId);
  const gpuVram = findSensor(gpuSensors, 'vram');
  const memUsage = findSensor(memorySensors, 'usage');

  const totalCpu = processes?.totalCpu ?? 0;
  const totalRateIn = network?.entries.reduce((s, e) => s + e.rateIn, 0) ?? 0;
  const totalRateOut = network?.entries.reduce((s, e) => s + e.rateOut, 0) ?? 0;
  const rateInParts = formatRateParts(totalRateIn);
  const rateOutParts = formatRateParts(totalRateOut);

  const padTo60 = (arr: number[]) =>
    arr.length >= 60 ? arr.slice(-60) : [...new Array(60 - arr.length).fill(0), ...arr];

  const cpuHistory = padTo60(hist.cpu);
  // Per-GPU buffer keyed by the resolved GPU's name, so switching the picker
  // instantly shows that GPU's accumulated history (not the shared default).
  const gpuHistory = padTo60([...getGpuHist(gpuName)]);
  const netDownHistory = padTo60(hist.netDown);
  const netUpHistory = padTo60(hist.netUp);

  // Source CPU/Memory from the same LHM sensors the monitoring widget reads,
  // so the overview card and per-tab chart show identical values. `hist`/
  // `totalCpu` props are consumed by the sparklines below.
  const cpuTotalSensor = frame?.cpu?.sensors?.find(s => s.name === 'CPU Total');
  const cpuFromSensor = cpuTotalSensor?.value ?? 0;
  const displayCpu = cpuFromSensor > 0 ? cpuFromSensor
    : totalCpu > 0 ? totalCpu
    : cpuHistory[cpuHistory.length - 1] ?? 0;
  const cpuParts = formatPercentParts(displayCpu);
  const gpuParts = gpuLoad ? formatPercentParts(gpuLoad.value) : null;
  const memUsedSensor = memorySensors.find(s => s.name === 'Memory Used');
  const memPctFromUsage = memUsage ? Math.round(memUsage.value) : 0;
  // theoreticalMaximum (GB) ships on the Memory Used sensor itself. Fall back
  // to the frame's string only for older services that omit it.
  const totalMemGbFromSensor = memUsedSensor?.theoreticalMaximum ?? 0;
  const totalMemGb = totalMemGbFromSensor > 0
    ? totalMemGbFromSensor.toFixed(0)
    : frame?.memoryTotal ? frame.memoryTotal.replace(/ GB$/, '') : '?';
  const totalMemMb = (totalMemGbFromSensor || parseFloat(totalMemGb)) * 1024;
  const usedMemMb = memUsedSensor ? memUsedSensor.value * 1024 : (hist.mem[hist.mem.length - 1] ?? 0);
  const memPct = totalMemMb > 0 ? Math.round((usedMemMb / totalMemMb) * 100) : memPctFromUsage;
  const displayMemPct = formatMemoryPercent(memPct || memPctFromUsage);
  const usedMemGb = (usedMemMb / 1024).toFixed(1);

  // Top processes by CPU; aggregate by name first (Windows sends duplicates).
  const procMap = new Map<string, { cpu: number; mem: number; net: number }>();
  for (const p of processes?.processes ?? []) {
    const existing = procMap.get(p.name);
    const netEntry = network?.entries.find(n => n.name === p.name);
    const net = netEntry ? netEntry.rateIn + netEntry.rateOut : 0;
    if (existing) {
      existing.cpu += p.cpuPercent;
      existing.mem += p.memoryMb;
    } else {
      procMap.set(p.name, { cpu: p.cpuPercent, mem: p.memoryMb, net });
    }
  }
  const topProcs = [...procMap.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.cpu - a.cpu)
    .slice(0, 10);

  return (
    <div className={styles.overview}>
      {/* Top row: CPU + GPU */}
      <div className={styles.overviewRow}>
        <button type="button" className={styles.dashCard} onClick={() => onNavigate('cpu')}>
          <div className={styles.dashCardHeader}>
            <span className={styles.dashCardTitle}>{t('monitoring.tab.cpu')}</span>
            <span className={styles.dashCardSub}>{frame?.cpuModel ?? ''}</span>
          </div>
          <div className={styles.dashCardBody}>
            <div className={styles.dashMetric}>
              <span className={`${styles.dashValue} ${styles.dashValuePercent}`}>{cpuParts.value}</span>
              <span className={styles.dashUnit}>{cpuParts.unit}</span>
            </div>
            <Sparkline className={styles.sparkline} values={cpuHistory} width="100%" height={32} color="var(--accent-glow)" strokeColor="var(--accent)" sampleCount={60} padding={2} />
          </div>
          <div className={styles.dashSecondary}>
            {cpuTemp && <span>{cpuTemp.formatted}</span>}
            {cpuCores && <span>{cpuCores.formatted} cores</span>}
          </div>
        </button>

        <button type="button" className={styles.dashCard} onClick={() => onNavigate('detailed')}>
          <div className={styles.dashCardHeader}>
            <span className={styles.dashCardTitle}>{t('monitoring.detailed.gpu')}</span>
            <span className={styles.dashCardSub}>{gpuName}</span>
          </div>
          <div className={styles.dashCardBody}>
            <div className={styles.dashMetric}>
              <span className={`${styles.dashValue} ${styles.dashValuePercent}`}>{gpuParts ? gpuParts.value : '—'}</span>
              <span className={styles.dashUnit}>{gpuParts ? gpuParts.unit : ''}</span>
            </div>
            <Sparkline className={styles.sparkline} values={gpuHistory} width="100%" height={32} color="var(--accent-glow)" strokeColor="var(--accent)" sampleCount={60} padding={2} />
          </div>
          <div className={styles.dashSecondary}>
            {gpuTemp && <span>{gpuTemp.formatted}</span>}
            {gpuVram && <span>{gpuVram.formatted}</span>}
          </div>
        </button>
      </div>

      {/* Middle row: RAM + Network + Storage */}
      <div className={styles.overviewRow}>
        <button type="button" className={styles.dashCard} onClick={() => onNavigate('memory')}>
          <div className={styles.dashCardHeader}>
            <span className={styles.dashCardTitle}>{t('monitoring.tab.memory')}</span>
          </div>
          <div className={styles.dashCardBody}>
            <div className={styles.dashMetric}>
              <span className={`${styles.dashValue} ${styles.dashValueMemory}`}>{displayMemPct}</span>
              <span className={styles.dashUnit}>%</span>
            </div>
            <span className={styles.dashMemLabel}>{usedMemGb} / {totalMemGb} GB</span>
          </div>
          <UsageBar value={memPct / 100} />
        </button>

        <button type="button" className={styles.dashCard} onClick={() => onNavigate('network')}>
          <div className={styles.dashCardHeader}>
            <span className={styles.dashCardTitle}>{t('monitoring.tab.network')}</span>
          </div>
          <div className={styles.dashNetRates}>
            <div className={styles.dashNetRow}>
              <span className={styles.dashNetArrow}>↓</span>
              <div className={styles.dashNetRate}>
                <span className={styles.dashNetValue}>{rateInParts.value}</span>
                <span className={styles.dashNetUnit}>{rateInParts.unit}</span>
              </div>
              <Sparkline className={styles.sparkline} values={netDownHistory} width="100%" height={20} color="var(--accent-glow)" strokeColor="var(--accent)" sampleCount={60} padding={2} />
            </div>
            <div className={styles.dashNetRow}>
              <span className={styles.dashNetArrow}>↑</span>
              <div className={styles.dashNetRate}>
                <span className={styles.dashNetValue}>{rateOutParts.value}</span>
                <span className={styles.dashNetUnit}>{rateOutParts.unit}</span>
              </div>
              <Sparkline className={styles.sparkline} values={netUpHistory} width="100%" height={20} color="var(--accent)" strokeColor="var(--accent-deep)" sampleCount={60} padding={2} />
            </div>
          </div>
        </button>

        <button type="button" className={styles.dashCard} onClick={() => onNavigate('detailed')}>
          <div className={styles.dashCardHeader}>
            <span className={styles.dashCardTitle}>{t('monitoring.detailed.storage')}</span>
          </div>
          <div className={styles.dashStorageList}>
            {Object.entries(storageComponents).map(([mount, sc]) => {
              const pct = parseFloat(sc.usedPercentage) || 0;
              return (
                <div key={mount} className={styles.dashDriveItem}>
                  <div className={styles.dashDriveHeader}>
                    <span className={styles.dashStorageName}>{mount}</span>
                    <span className={styles.dashStorageCap}>{sc.usedSpace} / {sc.capacity}</span>
                  </div>
                  <UsageBar
                    value={pct / 100}
                    color={pct > 90 ? 'var(--bad)' : pct > 75 ? 'var(--warn)' : undefined}
                  />
                </div>
              );
            })}
          </div>
        </button>
      </div>

      {/* Bottom: Top Processes */}
      {topProcs.length > 0 && (
        <button type="button" className={styles.dashCard + ' ' + styles.dashWide} onClick={() => onNavigate('cpu')}>
          <table className={styles.procTable}>
            <thead>
              <tr>
                <th>{t('monitoring.overview.process')}</th>
                <th>{t('monitoring.tab.cpu')}</th>
                <th>{t('monitoring.tab.memory')}</th>
                <th>{t('monitoring.tab.network')}</th>
              </tr>
            </thead>
            <tbody>
              {topProcs.map(p => (
                <tr key={p.name}>
                  <td className={styles.procName}>{p.name}</td>
                  <td>{p.cpu.toFixed(1)}%</td>
                  <td>{p.mem.toFixed(0)} MB</td>
                  <td>{formatRate(p.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </button>
      )}
    </div>
  );
}
