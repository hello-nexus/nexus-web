import { useTranslation } from '../../../lib/i18n';
import type { BenchmarkResult, BenchmarkSubScore } from '../../../types/benchmark';
import styles from './BenchmarkView.module.scss';

interface Props {
  result: BenchmarkResult;
  submission: { percentile: number; rank: number; total: number } | null;
  submitting: boolean;
}

export function BenchmarkResults({ result, submission, submitting }: Props) {
  const { t } = useTranslation();
  const subs: BenchmarkSubScore[] = [result.cpu, result.gpu, result.ram, result.storage];

  return (
    <div className={styles.resultsPanel}>
      <div className={styles.compositeCard}>
        <div className={styles.compositeLabel}>{t('benchmark.result.composite')}</div>
        <div className={styles.compositeScore}>{Math.round(result.composite)}</div>
        {submission && (
          <div className={styles.percentile}>
            {t('benchmark.result.percentile', {
              pct: submission.percentile.toFixed(1),
              total: String(submission.total),
            })}
          </div>
        )}
        {submitting && !submission && (
          <div className={styles.percentilePending}>{t('benchmark.result.submitting')}</div>
        )}
      </div>

      <ul className={styles.subList}>
        {subs.map(s => (
          <li key={s.key} className={styles.subCard}>
            <div className={styles.subHeader}>
              <span className={styles.subLabel}>{s.label}</span>
              <span className={styles.subScore}>{Math.round(s.score)}</span>
            </div>
            <div className={styles.subRaw}>
              {s.rawValue.toFixed(1)} {s.rawUnit}
            </div>
            <div className={styles.subDetail}>{s.detail}</div>
          </li>
        ))}
      </ul>

      <div className={styles.hardwareSummary}>
        <div>{t('benchmark.result.hardware')}:</div>
        <ul>
          <li>{result.hardware.cpuModel || '-'}</li>
          {result.hardware.gpuModels.map((g, i) => <li key={i}>{g}</li>)}
          <li>{result.hardware.ramModel || '-'}</li>
        </ul>
      </div>
    </div>
  );
}
