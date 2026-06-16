import { useTranslation } from '../../../lib/i18n';
import type { BenchmarkProgressFrame } from '../../../types/benchmark';
import styles from './BenchmarkView.module.scss';

interface Props {
  progress: BenchmarkProgressFrame;
}

const PHASES: Array<{ key: string; labelKey: string }> = [
  { key: 'cpu', labelKey: 'benchmark.phase.cpu' },
  { key: 'ram', labelKey: 'benchmark.phase.ram' },
  { key: 'storage', labelKey: 'benchmark.phase.storage' },
  { key: 'gpu', labelKey: 'benchmark.phase.gpu' },
];

export function BenchmarkProgress({ progress }: Props) {
  const { t } = useTranslation();

  const activeIdx = PHASES.findIndex(p => p.key === progress.phase.phase);
  const overallPct = Math.round((progress.overallPercent ?? 0) * 100);

  return (
    <div className={styles.progressPanel}>
      <div className={styles.overallRow}>
        <div className={styles.overallLabel}>{t('benchmark.overall')}</div>
        <div className={styles.overallBar}>
          <div
            className={styles.overallFill}
            style={{ width: `${Math.min(100, overallPct)}%` }}
          />
        </div>
        <div className={styles.overallPct}>{overallPct}%</div>
      </div>

      <ul className={styles.phaseList}>
        {PHASES.map((p, i) => {
          const state: 'done' | 'active' | 'pending' =
            i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'pending';
          const pct = state === 'done' ? 100 : state === 'active' ? Math.round((progress.phase.percent ?? 0) * 100) : 0;
          return (
            <li key={p.key} className={`${styles.phase} ${styles[`phase_${state}`]}`}>
              <div className={styles.phaseLabel}>{t(p.labelKey)}</div>
              <div className={styles.phaseBar}>
                <div className={styles.phaseFill} style={{ width: `${pct}%` }} />
              </div>
              <div className={styles.phaseDetail}>
                {state === 'active' && progress.phase.detail}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
