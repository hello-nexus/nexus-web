import { useCallback, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import classNames from 'classnames';
import type { ConnectionState } from '../../hooks/useServiceStatus';
import { useMonitoringFrame, type MonitoringFrame } from '../../hooks/useMonitoringFrame';
import { useNetworkMonitor, type NetworkData } from '../../hooks/useNetworkMonitor';
import { useProcessMonitor, type SeriesEntry } from '../../hooks/useProcessMonitor';
import { useSensors, type HardwareSensor } from '../../hooks/useSensors';
import { useSensorExtras, type ExtrasComponent } from '../../hooks/useSensorExtras';
import { useTranslation } from '../../lib/i18n';
import { useUiSettings } from '../../hooks/useUiSettings';
import * as monitoringStore from '../../lib/monitoringStore';
import { StackedChart } from '../StackedChart/StackedChart';
import { RankedList } from '../RankedList/RankedList';
import { Sparkline } from '../Sparkline/Sparkline';
import { ViewHeader } from '../ViewHeader/ViewHeader';
import { ServiceRequired } from './ServiceRequired';
import { ScreenTimeBrowse } from './ScreenTimeBrowse/ScreenTimeBrowse';
import { ScreenTimeDataControl } from './ScreenTimeBrowse/ScreenTimeDataControl';
import { MonitoringSkeleton } from './PageSkeleton/PageSkeleton';
import { UsageBar } from '../UsageBar/UsageBar';
import styles from './MonitoringView.module.scss';

type MonitoringTab = 'overview' | 'cpu' | 'memory' | 'network' | 'screentime' | 'detailed';
const VALID_TABS: MonitoringTab[] = ['overview', 'cpu', 'memory', 'network', 'screentime', 'detailed'];

interface MonitoringViewProps {
  serviceOnline: boolean;
  connectionState?: ConnectionState;
  tab: string | null;
  onTabChange: (tab: string) => void;
}

export function MonitoringView({ serviceOnline, connectionState, tab: urlTab, onTabChange }: MonitoringViewProps) {
  const tab: MonitoringTab = urlTab && VALID_TABS.includes(urlTab as MonitoringTab)
    ? urlTab as MonitoringTab : 'overview';

  const { t } = useTranslation();
  const monitoringFrame = useMonitoringFrame();
  const { cpuSeries, memSeries, sampleCount, totalCpu, systemMemMb } = useProcessMonitor();
  const network = useNetworkMonitor();
  const sensors = useSensors(serviceOnline);
  const overviewHist = monitoringStore.getOverviewHist();
  const [dataControlOpen, setDataControlOpen] = useState(false);
  const [browseRefresh, setBrowseRefresh] = useState(0);

  const { settings, update } = useUiSettings();
  const showAverage = settings.monitoringShowAverage;

  const toggleMode = useCallback(() => {
    update({ monitoringShowAverage: !showAverage });
  }, [showAverage, update]);

  const tabs = [
    { key: 'overview', label: t('monitoring.tab.overview') },
    { key: 'cpu', label: t('monitoring.tab.cpu') },
    { key: 'memory', label: t('monitoring.tab.memory') },
    { key: 'network', label: t('monitoring.tab.network') },
    { key: 'screentime', label: t('monitoring.tab.screentime') },
    { key: 'detailed', label: t('monitoring.tab.detailed') },
  ] as const;

  if (!serviceOnline) {
    return (
      <div className={styles.monitoring}>
        <ViewHeader title={t('nav.monitoring')} titleTooltip={t('monitoring.title.tooltip')} tabs={tabs} activeTab={tab} onTabChange={onTabChange} tabsDisabled />
        <ServiceRequired state={connectionState} skeleton={<MonitoringSkeleton />} />
      </div>
    );
  }

  const renderTab = () => {
    switch (tab) {
      case 'overview': return (
        <OverviewTab frame={monitoringFrame} hist={overviewHist} onNavigate={onTabChange} />
      );
      case 'cpu': return <CpuTab cpuSeries={cpuSeries} sampleCount={sampleCount} totalCpu={totalCpu} showAverage={showAverage} onToggle={toggleMode} />;
      case 'memory': return <MemoryTab memSeries={memSeries} sampleCount={sampleCount} systemMemMb={systemMemMb} showAverage={showAverage} onToggle={toggleMode} />;
      case 'network': return <NetworkTab network={network} showAverage={showAverage} onToggle={toggleMode} />;
      case 'screentime': return <ScreenTimeBrowse key={browseRefresh} onManageData={() => setDataControlOpen(true)} />;
      case 'detailed': return <DetailedTab sensors={sensors} />;
      // case fallthrough satisfies the exhaustive check on MonitoringTab.
    }
  };

  return (
    <div className={styles.monitoring}>
      <ViewHeader title={t('nav.monitoring')} titleTooltip={t('monitoring.title.tooltip')} tabs={tabs} activeTab={tab} onTabChange={onTabChange} />
      <div className={styles.tabContent}>
        {renderTab()}
      </div>
      <ScreenTimeDataControl
        open={dataControlOpen}
        onClose={() => setDataControlOpen(false)}
        onChanged={() => setBrowseRefresh(v => v + 1)}
      />
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────

interface OverviewHist {
  cpu: number[]; gpu: number[]; mem: number[]; netDown: number[]; netUp: number[];
}

function OverviewTab({ frame, hist, onNavigate }: {
  frame: MonitoringFrame | null;
  hist: OverviewHist;
  onNavigate: (tab: string) => void;
}) {
  const { t } = useTranslation();

  const cpuSensors = frame?.cpu?.sensors ?? [];
  const gpuSensors = frame?.gpu?.[0]?.sensors ?? [];
  const memorySensors = frame?.memory?.sensors ?? [];
  const storageComponents = frame?.storage ?? {};
  const processes = frame?.processes;
  const network = frame?.network;

  const findSensor = (list: typeof cpuSensors, id: string) => list.find(s => s.id.includes(id));
  const cpuTemp = cpuSensors.find(s => s.type === 'Temperature') ?? findSensor(cpuSensors, 'temp');
  const cpuCores = findSensor(cpuSensors, 'cores');
  const gpuLoad = findSensor(gpuSensors, 'load');
  const gpuTemp = findSensor(gpuSensors, 'temperature') ?? findSensor(gpuSensors, 'temp');
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
  const gpuHistory = padTo60(hist.gpu);
  const netDownHistory = padTo60(hist.netDown);
  const netUpHistory = padTo60(hist.netUp);

  const displayCpu = totalCpu > 0 ? totalCpu : cpuHistory[cpuHistory.length - 1] ?? 0;
  const cpuParts = formatPercentParts(displayCpu);
  const gpuParts = gpuLoad ? formatPercentParts(gpuLoad.value) : null;
  const usedMemMb = hist.mem[hist.mem.length - 1] ?? 0;
  const memPctFromUsage = memUsage ? Math.round(memUsage.value) : 0;
  const totalMemGb = frame?.memoryTotal ? frame.memoryTotal.replace(/ GB$/, '') : '?';
  const totalMemMb = parseFloat(totalMemGb) * 1024;
  const memPct = totalMemMb > 0 ? Math.round((usedMemMb / totalMemMb) * 100) : memPctFromUsage;
  const displayMemPct = formatMemoryPercent(memPct || memPctFromUsage);
  const usedMemGb = (usedMemMb / 1024).toFixed(1);

  // Top processes by CPU — aggregate by name first (Windows sends duplicates)
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
            <span className={styles.dashCardSub}>{frame?.gpuModels?.[0] ?? ''}</span>
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

// ── Ranked List Toggle ────────────────────────────────────────────────────

function RankedToggle({ showAverage, onToggle }: { showAverage: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="chip-group">
      <button
        type="button"
        className={`chip-action${!showAverage ? ' chip-active' : ''}`}
        onClick={() => { if (showAverage) onToggle(); }}
      >
        {t('monitoring.mode.live')}
      </button>
      <button
        type="button"
        className={`chip-action${showAverage ? ' chip-active' : ''}`}
        onClick={() => { if (!showAverage) onToggle(); }}
      >
        {t('monitoring.mode.60s')}
      </button>
    </div>
  );
}

function rankSeries(series: SeriesEntry[], showAverage: boolean) {
  const key: 'avg' | 'current' = showAverage ? 'avg' : 'current';
  const other = series.find(s => s.name === 'Other');
  const ranked = [...series]
    .filter(s => s.name !== 'Other')
    .sort((a, b) => b[key] - a[key]);
  if (other) ranked.push(other);
  return { ranked, key };
}

function CpuTab({ cpuSeries, sampleCount, totalCpu, showAverage, onToggle }: {
  cpuSeries: ReturnType<typeof useProcessMonitor>['cpuSeries'];
  sampleCount: number;
  totalCpu: number;
  showAverage: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();

  const displayCpu = totalCpu > 0
    ? totalCpu
    : cpuSeries.reduce((s, e) => s + e.current, 0);

  const { ranked, key } = rankSeries(cpuSeries, showAverage);

  return (
    <>
      <StackedChart
        title={t('monitoring.tab.cpu')}
        titleRight={
          <div className={styles.chartStat}>
            <span className={styles.chartStatValue}>{Math.round(displayCpu)}</span>
            <span className={styles.chartStatUnit}>%</span>
          </div>
        }
        series={cpuSeries}
        sampleCount={sampleCount}
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

function MemoryTab({ memSeries, sampleCount, systemMemMb, showAverage, onToggle }: {
  memSeries: ReturnType<typeof useProcessMonitor>['memSeries'];
  sampleCount: number;
  systemMemMb: number;
  showAverage: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();

  const usedMb = memSeries.reduce((s, e) => s + e.current, 0);
  const usedGb = (usedMb / 1024).toFixed(1);

  const { ranked, key } = rankSeries(memSeries, showAverage);

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
        series={memSeries}
        sampleCount={sampleCount}
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

function formatRate(bytesPerSec: number): string {
  if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`;
  if (bytesPerSec >= 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${Math.round(bytesPerSec)} B/s`;
}

// Mirrors formatRateParts: 4-char-wide string (1.2, 12.0, 120) so the value
// block stays a stable width and the sparkline doesn't shift between frames.
function formatPercentParts(percent: number): { value: string; unit: string } {
  const v = Math.max(0, percent);
  const roundedOneDecimal = Math.round(v * 10) / 10;
  const formatted = roundedOneDecimal >= 100
    ? String(Math.round(roundedOneDecimal))
    : roundedOneDecimal.toFixed(1);
  return { value: formatted, unit: '%' };
}

function formatMemoryPercent(percent: number): string {
  return String(Math.round(Math.max(0, Math.min(100, percent))));
}

// Step up units so the integer part stays at or below 3 digits. Decimals only below 100.
function formatRateParts(bytesPerSec: number): { value: string; unit: string } {
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s'];
  let value = Math.max(0, bytesPerSec);
  let i = 0;
  while (value >= 1000 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  let formatted: string;
  if (i === 0) formatted = String(Math.round(value));
  else if (value < 10) formatted = value.toFixed(2);
  else if (value < 100) formatted = value.toFixed(1);
  else formatted = String(Math.round(value));
  return { value: formatted, unit: units[i] };
}

function formatDataSize(kb: number): string {
  if (kb >= 1024 * 1024) return `${(kb / (1024 * 1024)).toFixed(1)} GB`;
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${Math.round(kb)} KB`;
}

function NetworkTab({ network, showAverage, onToggle }: {
  network: NetworkData;
  showAverage: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();

  const entryRanked = [...network.entries].sort((a, b) => b.rateTotal - a.rateTotal);

  const items = showAverage
    ? [...network.series]
        .sort((a, b) => {
          const sumA = a.values.reduce((x, y) => x + y, 0);
          const sumB = b.values.reduce((x, y) => x + y, 0);
          return sumB - sumA;
        })
        .map(s => ({ name: s.name, color: s.color, value: s.values.reduce((x, y) => x + y, 0) }))
    : entryRanked.map(e => ({ name: e.name, color: e.color, value: e.rateTotal }));

  const totalIn = network.entries.reduce((s, e) => s + e.rateIn, 0);
  const totalOut = network.entries.reduce((s, e) => s + e.rateOut, 0);
  const inParts = formatRateParts(totalIn);
  const outParts = formatRateParts(totalOut);

  return (
    <>
      <StackedChart
        title={t('monitoring.network.title')}
        titleRight={
          <>
            <div className={styles.chartStat}>
              <span className={styles.chartStatArrow}>↓</span>
              <span className={styles.chartStatValue}>{inParts.value}</span>
              <span className={styles.chartStatUnit}>{inParts.unit}</span>
            </div>
            <div className={styles.chartStat}>
              <span className={styles.chartStatArrow}>↑</span>
              <span className={styles.chartStatValue}>{outParts.value}</span>
              <span className={styles.chartStatUnit}>{outParts.unit}</span>
            </div>
          </>
        }
        series={network.series}
        sampleCount={network.sampleCount}
        yUnit="KB/s"
        xSeconds={60}
      />
      <RankedList
        title={t('monitoring.network.top')}
        subtitle={<RankedToggle showAverage={showAverage} onToggle={onToggle} />}
        items={items}
        formatValue={showAverage ? formatDataSize : formatRate}
        emptyMessage={t('monitoring.ranked.empty')}
      />
    </>
  );
}


// hwinfo64-style ordering: temps and loads first, then clocks, power, voltage,
// fans, capacities, then everything else. Sensors that don't match a bucket
// drop to "other" so we never silently lose data.
const SENSOR_TYPE_ORDER = [
  'Temperature', 'Load', 'Level', 'Control', 'Clock', 'Frequency',
  'Power', 'Energy', 'Voltage', 'Current',
  'Fan', 'Flow', 'Noise',
  'Data', 'SmallData', 'Throughput',
  'Factor', 'TimeSpan', 'Text',
];

function groupByType(list: HardwareSensor[]): Array<{ type: string; sensors: HardwareSensor[] }> {
  const map = new Map<string, HardwareSensor[]>();
  for (const s of list) {
    const key = s.type || 'Other';
    const arr = map.get(key);
    if (arr) arr.push(s); else map.set(key, [s]);
  }
  const ordered: Array<{ type: string; sensors: HardwareSensor[] }> = [];
  for (const t of SENSOR_TYPE_ORDER) {
    const arr = map.get(t);
    if (arr && arr.length > 0) {
      ordered.push({ type: t, sensors: arr });
      map.delete(t);
    }
  }
  for (const [type, arr] of map) ordered.push({ type, sensors: arr });
  return ordered;
}

// Plain in-flow section. Click anywhere on the header to toggle the body.
// No sticky positioning, no scroll spying -- the headers scroll with content.
function DetailSection({
  id, title, subtitle, sensors, collapsed, onToggle, groupTypeLabel,
}: {
  id: string;
  title: string;
  subtitle?: string;
  sensors: HardwareSensor[];
  collapsed: boolean;
  onToggle: (id: string) => void;
  groupTypeLabel: (type: string) => string;
}) {
  const groups = useMemo(() => groupByType(sensors), [sensors]);
  return (
    <section className={styles.detailSection} data-section-id={id}>
      <button
        type="button"
        className={styles.detailHeader}
        onClick={() => onToggle(id)}
        aria-expanded={!collapsed}
      >
        <ChevronDown
          size={16}
          className={classNames(styles.detailChevron, { [styles.detailChevronCollapsed]: collapsed })}
        />
        <span className={styles.detailTitle}>{title}</span>
        {subtitle && <span className={styles.detailSubtitle}>{subtitle}</span>}
      </button>
      {!collapsed && (
        <div className={styles.detailBody}>
          {groups.map(group => (
            <div key={group.type} className={styles.detailGroup}>
              <div className={styles.detailGroupLabel}>{groupTypeLabel(group.type)}</div>
              {group.sensors.map(s => (
                <div key={s.id} className={styles.detailRow}>
                  <span className={styles.detailRowLabel}>{s.name}</span>
                  <span className={styles.detailRowValue}>{s.formatted || `${s.value}`}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DetailedTab({ sensors }: { sensors: ReturnType<typeof useSensors> }) {
  const { t } = useTranslation();
  const extras = useSensorExtras(true);
  const { settings, update } = useUiSettings();

  const collapsed = settings.monitoringDetailedCollapsed;
  const isCollapsed = useCallback((id: string) => collapsed.includes(id), [collapsed]);
  const onToggle = useCallback((id: string) => {
    const next = collapsed.includes(id)
      ? collapsed.filter(x => x !== id)
      : [...collapsed, id];
    update({ monitoringDetailedCollapsed: next });
  }, [collapsed, update]);

  const groupTypeLabel = useCallback((type: string) => {
    const key = `monitoring.detailed.group.${type.toLowerCase()}`;
    const translated = t(key);
    // Fall back to the raw LHM type name when the locale string is missing.
    return translated === key ? type : translated;
  }, [t]);

  // Storage section synthesizes per-drive capacity rows from the storage map
  // (drive letters / mount points) and joins any LHM storage sensors that were
  // already on the topic.
  const storageAllSensors = useMemo<HardwareSensor[]>(() => {
    return [
      ...Object.entries(sensors.storageComponents).flatMap(([mount, sc]) =>
        sc.sensors?.map(s => ({ ...s, id: s.id || `sc-${mount}-${s.name}` })) ?? [
          { id: `sc-${mount}-used`, name: `${mount} Used`, type: 'Data', value: 0, units: 'GB', formatted: sc.usedSpace, parent: { id: mount, name: mount } },
          { id: `sc-${mount}-free`, name: `${mount} Free`, type: 'Data', value: 0, units: 'GB', formatted: sc.freeSpace, parent: { id: mount, name: mount } },
          { id: `sc-${mount}-usage`, name: `${mount} Usage`, type: 'Level', value: 0, units: '%', formatted: sc.usedPercentage, parent: { id: mount, name: mount } },
        ]
      ),
      ...sensors.storageSensors,
    ];
  }, [sensors.storageComponents, sensors.storageSensors]);

  type Entry = { id: string; title: string; subtitle?: string; sensors: HardwareSensor[] };

  const entries: Entry[] = [];
  if (sensors.cpu.length > 0)
    entries.push({ id: 'cpu', title: t('monitoring.detailed.cpu'), subtitle: sensors.cpuModel, sensors: sensors.cpu });
  if (sensors.gpu.length > 0)
    entries.push({ id: 'gpu', title: t('monitoring.detailed.gpu'), subtitle: sensors.gpuModels[0], sensors: sensors.gpu });
  if (sensors.memory.length > 0)
    entries.push({ id: 'memory', title: t('monitoring.detailed.memory'), subtitle: sensors.memoryTotal, sensors: sensors.memory });
  if (storageAllSensors.length > 0)
    entries.push({ id: 'storage', title: t('monitoring.detailed.storage'), sensors: storageAllSensors });
  if (sensors.motherboard.length > 0 || sensors.motherboardModel)
    entries.push({
      id: 'motherboard',
      title: t('monitoring.detailed.system'),
      subtitle: sensors.motherboardModel,
      sensors: sensors.motherboard,
    });

  // Extras: one section per discovered hardware. Hides automatically when a
  // family has zero entries (e.g. desktops with no battery).
  const pushExtras = (kind: string, label: string, list: ExtrasComponent[]) => {
    list.forEach((c, i) => {
      if (c.sensors.length === 0) return;
      entries.push({
        id: `${kind}/${c.id || i}`,
        title: list.length > 1 ? `${label} ${i + 1}` : label,
        subtitle: c.name,
        sensors: c.sensors,
      });
    });
  };
  pushExtras('battery', t('monitoring.detailed.battery'), extras.batteries);
  pushExtras('psu', t('monitoring.detailed.psu'), extras.psus);
  pushExtras('cooler', t('monitoring.detailed.cooler'), extras.coolers);
  pushExtras('nic', t('monitoring.detailed.nic'), extras.nics);
  pushExtras('nvme', t('monitoring.detailed.nvme'), extras.nvmeStorage);
  pushExtras('ec', t('monitoring.detailed.ec'), extras.embeddedControllers);

  return (
    <div className={classNames(styles.detailedRoot, 'pageConstrained')}>
      {entries.map(entry => (
        <DetailSection
          key={entry.id}
          id={entry.id}
          title={entry.title}
          subtitle={entry.subtitle}
          sensors={entry.sensors}
          collapsed={isCollapsed(entry.id)}
          onToggle={onToggle}
          groupTypeLabel={groupTypeLabel}
        />
      ))}
    </div>
  );
}
