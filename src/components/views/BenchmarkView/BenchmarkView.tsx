import { useCallback, useEffect, useMemo, useState } from 'react';
import { Gauge, Play, Square, RotateCcw } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { useBenchmark } from '../../../hooks/useBenchmark';
import type { ConnectionState } from '../../../hooks/useServiceStatus';
import { ServiceRequired } from '../ServiceRequired';
import { GenericSkeleton } from '../PageSkeleton/PageSkeleton';
import { getDeviceId, getLastSubmissionId, matchComponents, setLastSubmissionId, submitBenchmark } from '../../../api/nexusApi';
import type { ComponentOption, ComponentCategory } from '../../../types/builder';
import type { MatchCandidate, MatchResponse, DetectedByCategory } from '../../../types/benchmark';
import { BenchmarkProgress } from './BenchmarkProgress';
import { BenchmarkResults } from './BenchmarkResults';
import { MatchConfirmPanel } from './MatchConfirmPanel';
import { Button } from '../../common/Button/Button';
import styles from './BenchmarkView.module.scss';

interface BenchmarkViewProps {
  serviceOnline: boolean;
  connectionState?: ConnectionState;
  onHardwareConfirmed: (detected: DetectedByCategory) => void;
  onViewLeaderboard?: () => void;
}

const CATEGORY_ORDER: ComponentCategory[] = ['cpu', 'gpu', 'ram', 'storage'];

export function BenchmarkView({ serviceOnline, connectionState, onHardwareConfirmed, onViewLeaderboard }: BenchmarkViewProps) {
  const { t } = useTranslation();
  const { status, progress, result, error, start, cancel, reset } = useBenchmark(serviceOnline);
  const [matches, setMatches] = useState<MatchResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submission, setSubmission] = useState<{ percentile: number; rank: number; total: number } | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(() => getLastSubmissionId());

  // Once the run completes, fire off: (1) catalog fuzzy match against the
  // detected hardware so we can render the confirmation panel, and (2)
  // submit the score to the public leaderboard (fire-and-forget).
  useEffect(() => {
    if (!result || result.state !== 'complete') return;
    let cancelled = false;

    (async () => {
      const m = await matchComponents({
        cpuModel: result.hardware.cpuModel,
        gpuModels: result.hardware.gpuModels,
        ramModel: result.hardware.ramModel,
        storageModel: result.hardware.storageModel,
      });
      if (cancelled) return;
      setMatches(m);
    })();

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
          setSubmissionId(res.id);
        }
      } finally {
        if (!cancelled) setSubmitting(false);
      }
    })();

    return () => { cancelled = true; };
  }, [result]);

  const resolveCandidates = useCallback(async (matches: MatchResponse): Promise<DetectedByCategory> => {
    const detected: DetectedByCategory = {};
    const put = async (cat: ComponentCategory, candidate: MatchCandidate | null | undefined) => {
      if (!candidate) return;
      const comp = await fetchComponent(cat, candidate.id);
      if (comp) detected[cat] = [comp];
    };
    await Promise.all([
      put('cpu', matches.cpu),
      matches.gpu && matches.gpu.length > 0
        ? Promise.all(matches.gpu.map(c => fetchComponent('gpu', c.id))).then(cs => {
            const hits = cs.filter((c): c is ComponentOption => c != null);
            if (hits.length > 0) detected.gpu = hits;
          })
        : Promise.resolve(),
      put('ram', matches.ram),
      put('storage', matches.storage),
    ]);
    return detected;
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!matches) return;
    const detected = await resolveCandidates(matches);
    onHardwareConfirmed(detected);
  }, [matches, resolveCandidates, onHardwareConfirmed]);

  const subscores = useMemo(() => {
    if (!result) return null;
    return CATEGORY_ORDER.map(cat => {
      switch (cat) {
        case 'cpu': return result.cpu;
        case 'gpu': return result.gpu;
        case 'ram': return result.ram;
        case 'storage': return result.storage;
        default: return null;
      }
    });
  }, [result]);

  if (!serviceOnline) {
    return (
      <section className={styles.bench}>
        <header className={styles.header}>
          <div className={styles.title}>
            <Gauge size={22} />
            <h2>{t('benchmark.title')}</h2>
          </div>
          <p className={styles.subtitle}>{t('benchmark.subtitle')}</p>
        </header>
        <div className="pageBody">
          <ServiceRequired state={connectionState} skeleton={<GenericSkeleton />} />
        </div>
      </section>
    );
  }

  return (
    <section className={styles.bench}>
      <header className={styles.header}>
        <div className={styles.title}>
          <Gauge size={22} />
          <h2>{t('benchmark.title')}</h2>
        </div>
        <p className={styles.subtitle}>{t('benchmark.subtitle')}</p>
      </header>

      <div className="pageBody">
      {status === 'idle' && (
        <div className={styles.intro}>
          <p className={styles.introBody}>{t('benchmark.intro.body')}</p>
          <ul className={styles.whatItMeasures}>
            <li>{t('benchmark.intro.cpu')}</li>
            <li>{t('benchmark.intro.ram')}</li>
            <li>{t('benchmark.intro.storage')}</li>
            <li>{t('benchmark.intro.gpu')}</li>
          </ul>
          <div className={styles.introActions}>
            <Button tone="accent" icon={<Play size={16} />} onClick={() => start()}>
              {t('benchmark.start')}
            </Button>
          </div>
        </div>
      )}

      {status === 'starting' && <div className={styles.hint}>{t('benchmark.starting')}</div>}

      {(status === 'running' || (status === 'starting' && progress)) && progress && (
        <>
          <BenchmarkProgress progress={progress} />
          <div className={styles.controls}>
            <Button tone="ghost" icon={<Square size={14} />} onClick={cancel}>
              {t('benchmark.cancel')}
            </Button>
          </div>
        </>
      )}

      {status === 'complete' && result && subscores && (
        <>
          <BenchmarkResults
            result={result}
            submission={submission}
            submitting={submitting}
            submissionId={submissionId}
            onViewLeaderboard={onViewLeaderboard}
          />
          <MatchConfirmPanel
            matches={matches}
            onConfirm={handleConfirm}
          />
          <div className={styles.controls}>
            <Button tone="ghost" icon={<RotateCcw size={14} />} onClick={reset}>
              {t('benchmark.rerun')}
            </Button>
          </div>
        </>
      )}

      {status === 'failed' && (
        <div className={styles.error}>
          <p>{t('benchmark.failed')}: {error ?? t('benchmark.unknownError')}</p>
          <Button tone="ghost" icon={<RotateCcw size={14} />} onClick={reset}>
            {t('benchmark.rerun')}
          </Button>
        </div>
      )}

      {status === 'cancelled' && (
        <div className={styles.hint}>
          <p>{t('benchmark.cancelled')}</p>
          <Button tone="ghost" icon={<RotateCcw size={14} />} onClick={reset}>
            {t('benchmark.rerun')}
          </Button>
        </div>
      )}
      </div>
    </section>
  );
}

async function fetchComponent(category: ComponentCategory, id: string): Promise<ComponentOption | null> {
  try {
    const base = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
    const res = await fetch(`${base}/catalog/${category}/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    const raw = await res.json();
    return { ...raw, type: category } as ComponentOption;
  } catch {
    return null;
  }
}
