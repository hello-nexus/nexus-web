import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Gauge, Play, RotateCcw, History, Trophy, Cpu, Monitor, MemoryStick, HardDrive, CircuitBoard, AppWindow } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { useBenchmark } from '../../../hooks/useBenchmark';
import { useBenchmarkHistory } from '../../../hooks/useBenchmarkHistory';
import { useSystemSpecs } from '../../../hooks/useSystemSpecs';
import type { SystemSpecs } from '../../../hooks/useSystemSpecs';
import type { ConnectionState } from '../../../hooks/useServiceStatus';
import { ViewHeader } from '../../../components/common/ViewHeader/ViewHeader';
import { Overlay } from '../../../components/common/Overlay/Overlay';
import { ServiceRequired } from '../../../components/views/ServiceRequired';
import { GenericSkeleton } from '../../../components/views/PageSkeleton/PageSkeleton';
import { EmptyState } from '../../../components/common/EmptyState/EmptyState';
import { Button } from '../../../components/common/Button/Button';
import { SectionHeader } from '../../../components/common/SectionHeader/SectionHeader';
import { SystemSpecsPanel } from '../../../components/common/SystemSpecsPanel/SystemSpecsPanel';
import { getDeviceId, getLastSubmissionId, setLastSubmissionId, submitBenchmark } from '../../../api/nexusApi';
import { BenchmarkProgress } from './BenchmarkProgress';
import { BenchmarkResults } from './BenchmarkResults';
import { LeaderboardView } from './LeaderboardView';
import styles from './BenchmarkPage.module.scss';

type BenchmarkTab = 'run' | 'results' | 'leaderboards';

// The rig shown as big blocks before a run: the four scored subsystems plus
// the board and OS for context. `get` pulls the model string from /system/specs.
const SPEC_BLOCKS: Array<{
  key: string;
  icon: ReactNode;
  labelKey: string;
  get: (s: SystemSpecs) => string;
}> = [
  { key: 'cpu', icon: <Cpu size={28} />, labelKey: 'benchmark.phase.cpu', get: s => s.processor },
  { key: 'gpu', icon: <Monitor size={28} />, labelKey: 'benchmark.phase.gpu', get: s => s.graphicsCard },
  { key: 'mobo', icon: <CircuitBoard size={28} />, labelKey: 'benchmark.spec.motherboard', get: s => s.motherboard },
  { key: 'ram', icon: <MemoryStick size={28} />, labelKey: 'benchmark.phase.ram', get: s => s.memory },
  { key: 'storage', icon: <HardDrive size={28} />, labelKey: 'benchmark.phase.storage', get: s => s.storage },
  { key: 'os', icon: <AppWindow size={28} />, labelKey: 'benchmark.leaderboard.os', get: s => s.osBuild },
];

interface BenchmarkPageProps {
  serviceOnline: boolean;
  connectionState?: ConnectionState;
  tab: string | null;
  onTabChange: (tab: string) => void;
}

export function BenchmarkPage({ serviceOnline, connectionState, tab: urlTab, onTabChange }: BenchmarkPageProps) {
  const { t } = useTranslation();
  const { status, progress, result, error, start, cancel, reset } = useBenchmark(serviceOnline);
  const { history, addRun } = useBenchmarkHistory();
  const { specs } = useSystemSpecs(serviceOnline);
  const [submitting, setSubmitting] = useState(false);
  const [submission, setSubmission] = useState<{ percentile: number; rank: number; total: number } | null>(null);
  const [submissionId, setSubmissionIdState] = useState<string | null>(() => getLastSubmissionId());
  const [savedResult, setSavedResult] = useState<typeof result>(null);

  const tabs = [
    { key: 'run', label: t('benchmark.tab.run'), icon: <Play size={14} /> },
    { key: 'results', label: t('benchmark.tab.results'), icon: <History size={14} /> },
    { key: 'leaderboards', label: t('benchmark.tab.leaderboards'), icon: <Trophy size={14} /> },
  ] as const;

  const tab: BenchmarkTab = urlTab && ['run', 'results', 'leaderboards'].includes(urlTab)
    ? urlTab as BenchmarkTab : 'run';

  useEffect(() => {
    if (!result || result.state !== 'complete') return;
    let cancelled = false;
    setSavedResult(result);

    (async () => {
      setSubmitting(true);
      try {
        const payload = {
          deviceId: getDeviceId(),
          cpuModel: result.hardware.cpuModel,
          gpuModels: result.hardware.gpuModels,
          cpuScore: result.cpu.score,
          gpuScore: result.gpu.score,
          ramScore: result.ram.score,
          storageScore: result.storage.score,
          composite: result.composite,
          rawMetrics: {
            cpu: { raw: result.cpu.rawValue, unit: result.cpu.rawUnit, detail: result.cpu.detail },
            gpu: { raw: result.gpu.rawValue, unit: result.gpu.rawUnit, detail: result.gpu.detail },
            ram: { raw: result.ram.rawValue, unit: result.ram.rawUnit, detail: result.ram.detail },
            storage: { raw: result.storage.rawValue, unit: result.storage.rawUnit, detail: result.storage.detail },
            os: result.hardware.os,
            cores: result.hardware.logicalCores,
          },
          clientVersion: String(__APP_VERSION__ ?? '0'),
          cpuRaw: result.cpu.rawValue,
          cpuUnit: result.cpu.rawUnit,
          gpuRaw: result.gpu.rawValue,
          gpuUnit: result.gpu.rawUnit,
          ramRaw: result.ram.rawValue,
          ramUnit: result.ram.rawUnit,
          storageRaw: result.storage.rawValue,
          storageUnit: result.storage.rawUnit,
          scoringVersion: result.scoringVersion,
          ramModel: result.hardware.ramModel,
          storageModel: result.hardware.storageModel,
          os: result.hardware.os,
          logicalCores: result.hardware.logicalCores,
          benchTools: result.tools,
        };
        const res = await submitBenchmark(payload);
        if (!cancelled && res) {
          setSubmission({ percentile: res.percentile, rank: res.rank, total: res.totalSubmissions });
          setLastSubmissionId(res.id);
          setSubmissionIdState(res.id);
          addRun(result, res.id);
          onTabChange('results');
        } else if (!cancelled) {
          addRun(result, null);
          onTabChange('results');
        }
      } finally {
        if (!cancelled) setSubmitting(false);
      }
    })();

    return () => { cancelled = true; };
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRerun = useCallback(async () => {
    setSubmission(null);
    setSavedResult(null);
    await reset();
  }, [reset]);

  if (!serviceOnline) {
    return (
      <div className={styles.benchmark}>
        <ViewHeader title={t('benchmark.title')} tabs={tabs} activeTab={tab} onTabChange={onTabChange} tabsDisabled />
        <ServiceRequired state={connectionState} skeleton={<GenericSkeleton />} />
      </div>
    );
  }

  const renderRunTab = () => {
    if (status === 'idle') {
      return (
        <div className={styles.intro}>
          {specs && (
            <div className={styles.specsSection}>
              <SectionHeader>{t('benchmark.run.systemTitle')}</SectionHeader>
              <div className={styles.specGrid}>
                <SystemSpecsPanel
                  variant="tiles"
                  rows={SPEC_BLOCKS.map(b => ({ icon: b.icon, label: t(b.labelKey), value: b.get(specs) }))}
                />
              </div>
            </div>
          )}
          <ul className={styles.whatItMeasures}>
            <li>{t('benchmark.intro.cpu')}</li>
            <li>{t('benchmark.intro.ram')}</li>
            <li>{t('benchmark.intro.storage')}</li>
            <li>{t('benchmark.intro.gpu')}</li>
          </ul>
          <div className={styles.controls}>
            <Button tone="accent" icon={<Play size={16} />} onClick={() => start()}>
              {t('benchmark.start')}
            </Button>
          </div>
        </div>
      );
    }

    // 'starting' / 'running' render in the blocking modal below, not inline.
    if (status === 'starting' || status === 'running') {
      return null;
    }

    if (status === 'complete' && (result ?? savedResult)) {
      const r = result ?? savedResult!;
      return (
        <>
          <BenchmarkResults
            result={r}
            submission={submission}
            submitting={submitting}
            submissionId={submissionId}
          />
          <div className={styles.controls}>
            <Button tone="ghost" icon={<RotateCcw size={14} />} onClick={handleRerun}>
              {t('benchmark.rerun')}
            </Button>
          </div>
        </>
      );
    }

    if (status === 'failed') {
      return (
        <div className={styles.error}>
          <p>{t('benchmark.failed')}: {error ?? t('benchmark.unknownError')}</p>
          <Button tone="ghost" icon={<RotateCcw size={14} />} onClick={handleRerun}>
            {t('benchmark.rerun')}
          </Button>
        </div>
      );
    }

    if (status === 'cancelled') {
      return (
        <div className={styles.hint}>
          <p>{t('benchmark.cancelled')}</p>
          <Button tone="ghost" icon={<RotateCcw size={14} />} onClick={handleRerun}>
            {t('benchmark.rerun')}
          </Button>
        </div>
      );
    }

    return null;
  };

  const renderResultsTab = () => {
    const latest = history[0] ?? null;
    if (!latest) {
      return (
        <EmptyState
          icon={<Gauge size={32} />}
          title={t('benchmark.history.empty')}
        />
      );
    }

    return (
      <div className={styles.resultsTab}>
        <BenchmarkResults
          result={latest.result}
          submission={null}
          submitting={false}
          submissionId={latest.submissionId}
        />
        {history.length > 1 && (
          <div className={styles.historySection}>
            <SectionHeader>{t('benchmark.history.title')}</SectionHeader>
            <ul className={styles.historyList}>
              {history.slice(1).map(run => (
                <li key={run.id} className={styles.historyItem}>
                  <span className={styles.historyDate}>
                    {new Date(run.timestamp).toLocaleDateString()}
                  </span>
                  <span className={styles.historyScore}>{Math.round(run.composite)}</span>
                  <span className={styles.historyCpu}>{run.cpuModel}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const renderTab = () => {
    switch (tab) {
      case 'run': return renderRunTab();
      case 'results': return renderResultsTab();
      case 'leaderboards': return <LeaderboardView />;
    }
  };

  return (
    <div className={styles.benchmark}>
      <ViewHeader
        title={t('benchmark.title')}
        tabs={tabs}
        activeTab={tab}
        onTabChange={onTabChange}
      />
      <div className={`${styles.tabContent} pageBody`}>
        {renderTab()}
      </div>

      {/* Running locks the whole UI: a non-dismissable modal (portaled above
          the chrome) so the user can't navigate away mid-run and orphan the
          service-side benchmark. Cancel is the only exit. */}
      <Overlay
        open={status === 'starting' || status === 'running'}
        onClose={() => { /* no dismiss; Cancel is the only exit */ }}
        variant="alert"
        noEscDismiss
        noBackdropDismiss
        ariaLabel={t('benchmark.title')}
        className={styles.runModal}
      >
        <div className={styles.runModalBody}>
          {progress
            ? <BenchmarkProgress progress={progress} />
            : <div className={styles.hint}>{t('benchmark.starting')}</div>}
          <div className={styles.controls}>
            <Button tone="neutral" onClick={cancel}>
              {t('benchmark.cancel')}
            </Button>
          </div>
        </div>
      </Overlay>
    </div>
  );
}
