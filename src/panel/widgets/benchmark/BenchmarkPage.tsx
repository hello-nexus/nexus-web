import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { BenchmarkResult } from '../../../types/benchmark';
import { Gauge, Play, RotateCcw, History, Trophy, Cpu, Monitor, MemoryStick, HardDrive, CircuitBoard, AppWindow } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { useBenchmark } from '../../../hooks/useBenchmark';
import { useBenchmarkHistory, type BenchmarkRun } from '../../../hooks/useBenchmarkHistory';
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
import { getDeviceId, getLastSubmissionId, setLastSubmissionId } from '../../../api/nexusApi';
import { submitCloudBenchmark } from '../../../api/cloud';
import { fetchTelemetryConsent } from '../../../api/telemetry';
import { buildBenchmarkSubmission } from './benchmarkSubmission';
import { BenchmarkProgress } from './BenchmarkProgress';
import { BenchmarkResults } from './BenchmarkResults';
import { LeaderboardView } from './LeaderboardView';
import { OFFICIAL_BUILD } from '../../../lib/officialBuild';
import styles from './BenchmarkPage.module.scss';

type BenchmarkTab = 'run' | 'results' | 'leaderboards';

// The rig shown as compact tiles before a run: the four scored subsystems plus
// the board and OS for context. `get` pulls the model string from /system/specs.
const SPEC_BLOCKS: Array<{
  key: string;
  icon: ReactNode;
  labelKey: string;
  get: (s: SystemSpecs) => string;
}> = [
  { key: 'cpu', icon: <Cpu size={14} />, labelKey: 'benchmark.phase.cpu', get: s => s.processor },
  { key: 'gpu', icon: <Monitor size={14} />, labelKey: 'benchmark.phase.gpu', get: s => s.graphicsCard },
  { key: 'mobo', icon: <CircuitBoard size={14} />, labelKey: 'benchmark.spec.motherboard', get: s => s.motherboard },
  { key: 'ram', icon: <MemoryStick size={14} />, labelKey: 'benchmark.phase.ram', get: s => s.memory },
  { key: 'storage', icon: <HardDrive size={14} />, labelKey: 'benchmark.phase.storage', get: s => s.storage },
  { key: 'os', icon: <AppWindow size={14} />, labelKey: 'benchmark.leaderboard.os', get: s => s.osBuild },
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
  const { history, addRun, updateRunSubmission } = useBenchmarkHistory();
  const { specs } = useSystemSpecs(serviceOnline);
  const [submission, setSubmission] = useState<{ percentile: number; rank: number; total: number } | null>(null);
  const [submissionId, setSubmissionIdState] = useState<string | null>(() => getLastSubmissionId());
  const [savedResult, setSavedResult] = useState<typeof result>(null);
  // null only while the first read is in flight; a failed read counts as off,
  // so a run is always saved and never auto-uploads without confirmed consent.
  const [telemetryEnabled, setTelemetryEnabled] = useState<boolean | null>(null);
  // History entry of the run this page just finished, and the entry uploading now.
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [uploadingRunId, setUploadingRunId] = useState<string | null>(null);
  // useBenchmark can hand over the same run more than once (WS frame + poller).
  const decidedRunIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!serviceOnline) return;
    let cancelled = false;
    fetchTelemetryConsent()
      .then(res => { if (!cancelled) setTelemetryEnabled(res?.enabled === true); })
      .catch(() => { if (!cancelled) setTelemetryEnabled(false); });
    return () => { cancelled = true; };
  }, [serviceOnline]);

  // The board is hosted; local runs and results are not, so only it drops out.
  const tabs = [
    { key: 'run', label: t('benchmark.tab.run'), icon: <Play size={14} /> },
    { key: 'results', label: t('benchmark.tab.results'), icon: <History size={14} /> },
    ...(OFFICIAL_BUILD
      ? [{ key: 'leaderboards' as const, label: t('benchmark.tab.leaderboards'), icon: <Trophy size={14} /> }]
      : []),
  ] satisfies readonly { key: BenchmarkTab; label: string; icon: ReactNode }[];

  const validTabs: readonly string[] = tabs.map((t) => t.key);
  const tab: BenchmarkTab = urlTab && validTabs.includes(urlTab)
    ? urlTab as BenchmarkTab : 'run';

  const upload = useCallback(async (runId: string, r: BenchmarkResult) => {
    setUploadingRunId(runId);
    try {
      // Routed through the local service (not api.hellonexus.com directly):
      // the benchmark UI only ever runs in-app, so the service can forward
      // the signed-in cloud account's bearer and link the submission - a
      // bare browser fetch has no way to attach that token.
      const res = await submitCloudBenchmark(buildBenchmarkSubmission(r, getDeviceId()));
      if (res) {
        const standing = { percentile: res.percentile, rank: res.rank, total: res.totalSubmissions };
        updateRunSubmission(runId, res.id, standing);
        setLastSubmissionId(res.id);
        setSubmission(standing);
        setSubmissionIdState(res.id);
      }
    } catch {
      // A failed upload leaves the run unsubmitted, so it is offered again.
    } finally {
      setUploadingRunId(current => (current === runId ? null : current));
    }
  }, [updateRunSubmission]);

  useEffect(() => {
    if (!result || result.state !== 'complete') return;
    setSavedResult(result);
    if (telemetryEnabled === null || decidedRunIdRef.current === result.runId) return;
    decidedRunIdRef.current = result.runId;
    // Saved before any upload, so the run survives a failed or abandoned submit.
    const id = addRun(result, null);
    setActiveRunId(id);
    onTabChange('results');
    if (telemetryEnabled) void upload(id, result);
  }, [result, telemetryEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // Offered only while "Help improve Nexus" is off; failed reads count as off.
  const uploadHandlerFor = (run: BenchmarkRun | null) =>
    run && telemetryEnabled === false && !run.submission && uploadingRunId !== run.id
      ? () => { void upload(run.id, run.result); }
      : undefined;
  const activeRun = history.find(run => run.id === activeRunId) ?? null;

  const handleRerun = useCallback(async () => {
    setSubmission(null);
    setSavedResult(null);
    setActiveRunId(null);
    decidedRunIdRef.current = null;
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

  // Shown wherever the page has no run yet: the Run tab you land on and the
  // Results tab.
  const renderIntro = (onStart: () => void) => (
    <EmptyState
      hero
      icon={<Gauge />}
      title={t('benchmark.results.introTitle')}
      hint={t('benchmark.results.introBody')}
      points={[
        { icon: <Cpu />, text: t('benchmark.phase.cpu') },
        { icon: <Monitor />, text: t('benchmark.phase.gpu') },
        { icon: <MemoryStick />, text: t('benchmark.phase.ram') },
        { icon: <HardDrive />, text: t('benchmark.phase.storage') },
      ]}
      action={(
        <Button tone="accent" icon={<Play size={16} />} onClick={onStart}>
          {t('benchmark.start')}
        </Button>
      )}
    />
  );

  const renderRunTab = () => {
    if (status === 'idle') {
      const specsSection = specs && (
        <div className={styles.specsSection}>
          <SectionHeader>{t('benchmark.run.systemTitle')}</SectionHeader>
          <div className={styles.specGrid}>
            <SystemSpecsPanel
              variant="tiles"
              iconInline
              rows={SPEC_BLOCKS.map(b => ({ icon: b.icon, label: t(b.labelKey), value: b.get(specs) }))}
            />
          </div>
        </div>
      );
      if (history.length === 0) {
        return (
          <div className={styles.firstRun}>
            {renderIntro(() => { void start(); })}
            {specsSection}
          </div>
        );
      }
      return (
        <div className={styles.intro}>
          {specsSection}
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
            submitting={uploadingRunId !== null && uploadingRunId === activeRunId}
            submissionId={submissionId}
            onUpload={uploadHandlerFor(activeRun)}
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
      return renderIntro(() => { onTabChange('run'); void start(); });
    }

    return (
      <div className={styles.resultsTab}>
        <BenchmarkResults
          result={latest.result}
          submission={latest.submission ?? null}
          submitting={uploadingRunId === latest.id}
          submissionId={latest.submissionId}
          onUpload={uploadHandlerFor(latest)}
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
      case 'leaderboards': return OFFICIAL_BUILD ? <LeaderboardView /> : null;
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
