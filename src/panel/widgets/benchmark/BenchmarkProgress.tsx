import { useEffect, useMemo, useState } from 'react';
import { Cpu, MemoryStick, HardDrive, Monitor, type LucideIcon } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { getBenchmarkRanges } from '../../../api/nexusApi';
import type { BenchmarkProgressFrame, BenchmarkRanges, BenchmarkResult, BenchmarkSubScore } from '../../../types/benchmark';
import { BenchmarkChip } from './BenchmarkChip';
import styles from './BenchmarkProgress.module.scss';

type PhaseKey = BenchmarkSubScore['key'];

interface Props {
  progress: BenchmarkProgressFrame;
  /** Shorter towers and a narrower readout column, for touch-panel cells. */
  compact?: boolean;
  /** Fires once, after the last phase's reveal and the composite reveal have played on a completed run. */
  onRevealed?: () => void;
  /** The run's REST result; once complete it drives the reveal even if the WebSocket's final frame never arrives. */
  result?: BenchmarkResult | null;
}

const PHASES: Array<{ key: PhaseKey; labelKey: string; icon: LucideIcon }> = [
  { key: 'cpu', labelKey: 'benchmark.phase.cpu', icon: Cpu },
  { key: 'ram', labelKey: 'benchmark.phase.ram', icon: MemoryStick },
  { key: 'storage', labelKey: 'benchmark.phase.storage', icon: HardDrive },
  { key: 'gpu', labelKey: 'benchmark.phase.gpu', icon: Monitor },
];

// A finished phase holds its reveal this long before the next phase is shown running; sized to the reveal
// animations, which are multiples of --ease-slow.
const HOLD_MS = 2000;
const FINALE_MS = 2800;

// Share of the part's top-1% score; without one (offline, no runs yet) a log10 scale.
function towerHeight(score: number, top: number | null | undefined): number {
  if (score <= 0) return 0.06;
  const share = top && top > 0 ? score / top : (Math.log10(score) - 2) / 2;
  return Math.min(1, Math.max(0.06, share));
}

// Geometric mean with non-positive scores counted as 1, rounded like the service's Scoring.Composite; used until
// the REST result carries the authoritative composite.
function compositeOf(scores: Partial<Record<PhaseKey, BenchmarkSubScore>>): number {
  const logs = PHASES.map(p => {
    const s = scores[p.key]?.score ?? 0;
    return Math.log(s <= 0 ? 1 : s);
  });
  return Math.round(Math.round(Math.exp(logs.reduce((a, b) => a + b, 0) / logs.length) * 10) / 10);
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function CountUp({ value, delayMs = 0, durationMs }: { value: number; delayMs?: number; durationMs: number }) {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? value : 0));
  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(value);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start - delayMs) / durationMs));
      setShown(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, delayMs, durationMs]);
  return <>{shown}</>;
}

export function BenchmarkProgress({ progress, compact = false, onRevealed, result = null }: Props) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState<PhaseKey[]>([]);
  const [ranges, setRanges] = useState<BenchmarkRanges | null>(null);

  useEffect(() => {
    let live = true;
    void getBenchmarkRanges().then(r => { if (live) setRanges(r); });
    return () => { live = false; };
  }, []);

  const resultDone = result?.state === 'complete' && result.runId === progress.runId;
  const scores = useMemo(() => {
    const byKey: Partial<Record<PhaseKey, BenchmarkSubScore>> = {};
    for (const s of progress.completedSubScores ?? []) byKey[s.key] = s;
    if (resultDone && result) {
      for (const s of [result.cpu, result.ram, result.storage, result.gpu]) byKey[s.key] = s;
    }
    return byKey;
  }, [progress.completedSubScores, resultDone, result]);

  const celebrating = PHASES.find(p => scores[p.key] && !revealed.includes(p.key))?.key ?? null;
  const finale = (progress.state === 'complete' || resultDone) && celebrating === null;

  useEffect(() => {
    if (!celebrating) return;
    const id = setTimeout(() => setRevealed(r => (r.includes(celebrating) ? r : [...r, celebrating])), HOLD_MS);
    return () => clearTimeout(id);
  }, [celebrating]);

  useEffect(() => {
    if (!finale || !onRevealed) return;
    const id = setTimeout(onRevealed, FINALE_MS);
    return () => clearTimeout(id);
  }, [finale, onRevealed]);

  const serverIdx = PHASES.findIndex(p => p.key === progress.phase?.phase);
  const shownIdx = celebrating === null && serverIdx >= 0 && !scores[PHASES[serverIdx].key] ? serverIdx : -1;
  const livePct = Math.round(Math.min(1, Math.max(0, progress.phase?.percent ?? 0)) * 100);
  const overallPct = finale ? 100 : Math.round(Math.min(1, Math.max(0, progress.overallPercent ?? 0)) * 100);

  let nowLabel = t('benchmark.progress.nowTesting');
  let nowName = t('benchmark.starting');
  let nowDetail = '';
  if (finale) {
    nowLabel = t('benchmark.progress.complete');
    nowName = t('benchmark.progress.allDone');
  } else if (celebrating) {
    nowLabel = t('benchmark.progress.lockedIn');
    nowName = t(`benchmark.phase.${celebrating}`);
    nowDetail = t('benchmark.result.pts', { n: String(Math.round(scores[celebrating]?.score ?? 0)) });
  } else if (shownIdx >= 0) {
    nowName = t(PHASES[shownIdx].labelKey);
    nowDetail = progress.phase.detail;
  }

  const surgeKey = finale ? 'finale' : celebrating;

  return (
    <div className={`${styles.root} ${compact ? styles.compact : ''}`}>
      <div className={styles.side}>
        <div className={styles.readout}>
          <BenchmarkChip surgeKey={surgeKey} className={compact ? styles.compactChip : undefined} />
          {finale ? (
            <>
              <div className={styles.readoutLabel}>{t('benchmark.result.composite')}</div>
              <div className={`${styles.big} ${styles.bigScore}`}>
                <CountUp value={resultDone && result ? Math.round(result.composite) : compositeOf(scores)} durationMs={1400} />
              </div>
            </>
          ) : (
            <>
              <div className={styles.readoutLabel}>{t('benchmark.overall')}</div>
              <div className={styles.big}>
                {overallPct}
                <span className={styles.bigUnit}>%</span>
              </div>
            </>
          )}
        </div>
        <div className={styles.now}>
          <div className={styles.nowLabel}>{nowLabel}</div>
          <div className={styles.nowName}>{nowName}</div>
          {nowDetail && <div className={styles.nowDetail}>{nowDetail}</div>}
        </div>
      </div>

      <div className={styles.towers}>
        {PHASES.map((p, i) => {
          const sub = scores[p.key];
          const isCelebrating = celebrating === p.key;
          const isDone = !!sub && (revealed.includes(p.key) || isCelebrating);
          const isActive = !isDone && (i === shownIdx || (!!sub && !isCelebrating));
          const state = isDone ? 'done' : isActive ? 'active' : 'pending';
          const chargePct = sub ? 100 : livePct;
          const score = sub?.score ?? 0;
          const heightPct = `${(towerHeight(score, ranges?.[p.key]) * 100).toFixed(2)}%`;
          return (
            <div key={p.key} className={`${styles.col} ${styles[state]} ${isCelebrating ? styles.celebrating : ''}`}>
              <div className={styles.tower}>
                <div className={styles.track}>
                  {isActive && (
                    <div className={styles.charge} style={{ height: `${chargePct}%` }}>
                      <div className={styles.chargeFill} />
                      <div className={styles.chargeTop} />
                    </div>
                  )}
                  {isDone && (
                    <div className={styles.solid} style={{ height: heightPct }}>
                      <div className={styles.solidTop} />
                    </div>
                  )}
                  <div className={styles.flash} />
                </div>
                {isActive && (
                  <div className={styles.cap} style={{ bottom: `${chargePct}%` }}>
                    <span className={styles.capLive}>{chargePct}%</span>
                  </div>
                )}
                {isDone && (
                  <div className={`${styles.cap} ${styles.capDone}`} style={{ bottom: heightPct }}>
                    <span className={styles.capNum}>
                      {isCelebrating ? <CountUp value={Math.round(score)} delayMs={250} durationMs={1200} /> : Math.round(score)}
                    </span>
                  </div>
                )}
                {isCelebrating && (
                  <div className={styles.burst} aria-hidden="true">
                    <span className={styles.ring} />
                    <span className={`${styles.spark} ${styles.s1}`} />
                    <span className={`${styles.spark} ${styles.s2}`} />
                    <span className={`${styles.spark} ${styles.s3}`} />
                    <span className={`${styles.spark} ${styles.s4}`} />
                    <span className={`${styles.spark} ${styles.s5}`} />
                    <span className={`${styles.spark} ${styles.s6}`} />
                  </div>
                )}
              </div>
              <div className={styles.label}>
                <p.icon size={compact ? 16 : 22} aria-hidden="true" />
                <span>{t(p.labelKey)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
