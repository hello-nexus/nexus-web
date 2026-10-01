import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { BenchmarkResult } from '../../../types/benchmark';
import { Gauge, Play, RotateCcw, History, Trophy, Cpu, Monitor, MemoryStick, HardDrive, CircuitBoard, AppWindow } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { formatDateTime, hour12OptionFor } from '../../../lib/units';
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
import { ChipGroup } from '../../../components/common/ChipGroup/ChipGroup';
import { SystemSpecsPanel } from '../../../components/common/SystemSpecsPanel/SystemSpecsPanel';
import { getDeviceId, setLastSubmissionId } from '../../../api/nexusApi';
import { submitCloudBenchmark } from '../../../api/cloud';
import { fetchTelemetryConsent } from '../../../api/telemetry';
import { buildBenchmarkSubmission } from './benchmarkSubmission';
import { BenchmarkProgress } from './BenchmarkProgress';
import { BenchmarkResults } from './BenchmarkResults';
import { LeaderboardView } from './LeaderboardView';
import { OFFICIAL_BUILD } from '../../../lib/officialBuild';
import styles from './BenchmarkPage.module.scss';

type BenchmarkTab = 'run' | 'results' | 'leaderboards';

const HISTORY_PARTS = ['cpu', 'gpu', 'ram', 'storage'] as const;

const RESULTS_PICKS = ['latest', 'best'] as const;
type ResultsPick = typeof RESULTS_PICKS[number];
type ResultsView = ResultsPick | { runId: string };

// A manual Latest/Best pick lives in sessionStorage, so it holds across visits and ends with the app session.
const RESULTS_PICK_KEY = 'nexus:benchmarkResultsPick';

function readResultsPick(): ResultsPick | null {
  try {
    const v = sessionStorage.getItem(RESULTS_PICK_KEY);
    return v === 'latest' || v === 'best' ? v : null;
  } catch {
    return null;
  }
}

function writeResultsPick(pick: ResultsPick): void {
  try { sessionStorage.setItem(RESULTS_PICK_KEY, pick); } catch { /* storage unavailable */ }
}

// Highest Nexus Score on the newest run's scoring version; scores across versions are not comparable.
function bestRun(history: BenchmarkRun[]): BenchmarkRun | null {
  const latest = history[0];
  if (!latest) return null;
  return history
    .filter(run => run.scoringVersion === latest.scoringVersion)
    .reduce((best, run) => (run.composite > best.composite ? run : best), latest);
}

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
  const { dateFormat, timeFormat } = useUnitPrefs();
  const { status, progress, result, error, start, cancel, reset } = useBenchmark(serviceOnline);
  const { history, addRun, updateRunSubmission } = useBenchmarkHistory();
  const { specs } = useSystemSpecs(serviceOnline);
  // null only while the first read is in flight; a failed read counts as off,
  // so a run is always saved and never auto-uploads without confirmed consent.
  const [telemetryEnabled, setTelemetryEnabled] = useState<boolean | null>(null);
  // What the Results tab shows on top: Latest after a run, else the session's pick, else Best.
  const [resultsView, setResultsView] = useState<ResultsView>(() => readResultsPick() ?? 'best');
  const [uploadingRunId, setUploadingRunId] = useState<string | null>(null);
  // useBenchmark can hand over the same run more than once (WS frame + poller).
  const decidedRunIdRef = useRef<string | null>(null);
  // Run whose closing reveal has played; until then a completed run keeps the modal open.
  const [revealedRunId, setRevealedRunId] = useState<string | null>(null);
  const revealing = status === 'complete' && !!progress && progress.runId !== revealedRunId;
  const progressRunId = progress?.runId ?? null;
  const handleRevealed = useCallback(() => setRevealedRunId(progressRunId), [progressRunId]);

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
      }
    } catch {
      // A failed upload leaves the run unsubmitted, so it is offered again.
    } finally {
      setUploadingRunId(current => (current === runId ? null : current));
    }
  }, [updateRunSubmission]);

  useEffect(() => {
    if (!result || result.state !== 'complete') return;
    if (telemetryEnabled === null || decidedRunIdRef.current === result.runId) return;
    decidedRunIdRef.current = result.runId;
    // Saved before any upload, so the run survives a failed or abandoned submit.
    const id = addRun(result, null);
    setResultsView('latest');
    onTabChange('results');
    if (telemetryEnabled) void upload(id, result);
  }, [result, telemetryEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // Offered only while "Help improve Nexus" is off; failed reads count as off.
  const uploadHandlerFor = (run: BenchmarkRun | null) =>
    run && telemetryEnabled === false && !run.submission && uploadingRunId !== run.id
      ? () => { void upload(run.id, run.result); }
      : undefined;

  const handleRerun = useCallback(async () => {
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

  // A finished run must be reset service-side before the next one starts.
  const startRun = () => {
    if (status === 'complete') void handleRerun().then(() => start());
    else void start();
  };

  // A finished run lives on the Results tab; the Run tab stays the launcher.
  const renderRunTab = () => {
    if (status === 'idle' || status === 'complete') {
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
            {renderIntro(startRun)}
            {specsSection}
          </div>
        );
      }
      return (
        <div className={styles.intro}>
          {specsSection}
          <div className={styles.controls}>
            <Button tone="accent" icon={<Play size={16} />} onClick={startRun}>
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
    const best = bestRun(history);
    const shown = resultsView === 'latest' ? latest
      : resultsView === 'best' ? best
      : history.find(run => run.id === resultsView.runId) ?? latest;
    if (!shown || !latest || !best) {
      return renderIntro(() => { onTabChange('run'); startRun(); });
    }
    const pickOptions = RESULTS_PICKS.map(key => ({ key, label: t(`benchmark.results.${key}`) }));
    let activePick: string = '';
    if (typeof resultsView === 'string') activePick = resultsView;
    else if (shown.id === latest.id) activePick = RESULTS_PICKS[0];
    else if (shown.id === best.id) activePick = RESULTS_PICKS[1];
    const onPick = (key: string) => {
      const pick = RESULTS_PICKS.find(p => p === key);
      if (!pick) return;
      writeResultsPick(pick);
      setResultsView(pick);
    };

    return (
      <div className={styles.resultsTab}>
        <div className={styles.resultsTop}>
          <BenchmarkResults
            result={shown.result}
            submission={shown.submission ?? null}
            submitting={uploadingRunId === shown.id}
            onUpload={uploadHandlerFor(shown)}
            actions={(
              <ChipGroup ariaLabel={t('benchmark.results.pickLabel')} options={pickOptions} activeKey={activePick} onChange={onPick} />
            )}
          />
        </div>
        <div className={styles.historySection}>
          <SectionHeader>{t('benchmark.history.title')}</SectionHeader>
          <ul className={styles.historyList}>
            {history.map(run => (
              <li key={run.id}>
                <button
                  type="button"
                  className={`${styles.historyItem} ${run.id === shown.id ? styles.historySelected : ''}`}
                  aria-pressed={run.id === shown.id}
                  onClick={() => setResultsView({ runId: run.id })}
                >
                  <span className={styles.historyDate}>
                    {formatDateTime(new Date(run.timestamp), dateFormat, {
                      year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                      hour12: hour12OptionFor(timeFormat),
                    }, { variant: 'year' })}
                  </span>
                  {HISTORY_PARTS.map(part => (
                    <span key={part} className={styles.historyPart}>
                      <span className={styles.historyPartLabel}>{t(`benchmark.phase.${part}`)}</span>
                      {Math.round(run[part])}
                    </span>
                  ))}
                  <span className={styles.historyScore}>{Math.round(run.composite)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
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
        open={status === 'starting' || status === 'running' || revealing}
        onClose={() => { /* no dismiss; Cancel is the only exit */ }}
        variant="alert"
        noEscDismiss
        noBackdropDismiss
        ariaLabel={t('benchmark.title')}
        className={styles.runModal}
      >
        <div className={styles.runModalBody}>
          {progress
            ? <BenchmarkProgress key={progress.runId} progress={progress} result={result} onRevealed={handleRevealed} />
            : <div className={styles.hint}>{t('benchmark.starting')}</div>}
          {!revealing && (
            <div className={styles.controls}>
              <Button tone="neutral" onClick={cancel}>
                {t('benchmark.cancel')}
              </Button>
            </div>
          )}
        </div>
      </Overlay>
    </div>
  );
}
