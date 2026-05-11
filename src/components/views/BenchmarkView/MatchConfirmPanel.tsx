import { useTranslation } from '../../../lib/i18n';
import { ArrowRight } from 'lucide-react';
import type { MatchCandidate, MatchResponse } from '../../../types/benchmark';
import styles from './BenchmarkView.module.scss';

interface Props {
  matches: MatchResponse | null;
  onConfirm: () => void;
}

interface Row {
  category: string;
  labelKey: string;
  match: MatchCandidate | null | undefined;
}

export function MatchConfirmPanel({ matches, onConfirm }: Props) {
  const { t } = useTranslation();

  const rows: Row[] = [
    { category: 'cpu', labelKey: 'benchmark.phase.cpu', match: matches?.cpu },
    { category: 'gpu', labelKey: 'benchmark.phase.gpu', match: matches?.gpu?.[0] },
    { category: 'ram', labelKey: 'benchmark.phase.ram', match: matches?.ram },
    { category: 'storage', labelKey: 'benchmark.phase.storage', match: matches?.storage },
  ];

  const hasAny = rows.some(r => r.match != null);

  return (
    <div className={styles.matchPanel}>
      <h3 className={styles.matchTitle}>{t('benchmark.match.title')}</h3>
      <p className={styles.matchSubtitle}>{t('benchmark.match.subtitle')}</p>
      {matches == null && (
        <div className={styles.matchPending}>{t('benchmark.match.loading')}</div>
      )}
      {matches != null && (
        <ul className={styles.matchList}>
          {rows.map(r => (
            <li key={r.category} className={styles.matchRow}>
              <div className={styles.matchCat}>{t(r.labelKey)}</div>
              {r.match ? (
                <>
                  <div className={styles.matchTitle2}>{r.match.title}</div>
                  <div
                    className={`${styles.matchConfidence} ${
                      r.match.confidence >= 0.75
                        ? styles.confHigh
                        : r.match.confidence >= 0.5
                          ? styles.confMed
                          : styles.confLow
                    }`}
                    title={`${Math.round(r.match.confidence * 100)}%`}
                  >
                    {r.match.confidence >= 0.75
                      ? t('benchmark.match.high')
                      : r.match.confidence >= 0.5
                        ? t('benchmark.match.medium')
                        : t('benchmark.match.low')}
                  </div>
                </>
              ) : (
                <div className={styles.matchNone}>{t('benchmark.match.none')}</div>
              )}
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className={styles.primary}
        onClick={onConfirm}
        disabled={!hasAny}
      >
        <span>{t('benchmark.match.confirm')}</span>
        <ArrowRight size={14} />
      </button>
    </div>
  );
}
