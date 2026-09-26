import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { DEFAULT_DATE_FORMAT, formatDate, type DateFormat } from '../../../lib/units';
import type { LeaderboardEntry } from '../../../types/benchmark';
import styles from './LeaderboardList.module.scss';

interface LeaderboardListProps {
  entries: LeaderboardEntry[];
  ownId: string | null;
  /** Rows render as real links (crawlable, cmd+click): the Build portal's /bench/:id pages. */
  entryHref?: (entry: LeaderboardEntry) => string;
  /** Rows render as buttons: the app opens the entry in place. */
  onOpen?: (entry: LeaderboardEntry) => void;
  /** Passed in, not read via useUnitPrefs: that hook's module drags the app's widget graph into the Build portal. */
  dateFormat?: DateFormat;
}

/**
 * Benchmark leaderboard rows as cards, each opening the entry's detail page.
 * Shared with the Build portal through @app so both surfaces show the same view.
 */
export function LeaderboardList({ entries, ownId, entryHref, onOpen, dateFormat = DEFAULT_DATE_FORMAT }: LeaderboardListProps) {
  const { t, language } = useTranslation();

  return (
    <ol className={styles.list} aria-label={t('benchmark.leaderboard.title')}>
      {entries.map(entry => {
        const isOwn = entry.id === ownId;
        const className = `${styles.row} ${isOwn ? styles.own : ''}`;
        const body: ReactNode = (
          <>
            <span className={styles.rank}>#{entry.rank}</span>
            <span className={styles.score}>{Math.round(entry.composite)}</span>
            <span className={styles.hardware}>
              <span className={styles.name}>
                {entry.displayName ?? t('benchmark.leaderboard.anonymous')}
                {isOwn && <span className={styles.ownBadge}>{t('benchmark.leaderboard.yourEntry')}</span>}
              </span>
              <span className={styles.cpu}>{entry.hardware.cpuModel}</span>
              {entry.hardware.gpuModels.length > 0 && (
                <span className={styles.gpu}>{entry.hardware.gpuModels[0]}</span>
              )}
            </span>
            <span className={styles.date}>{formatDate(new Date(entry.createdAt), dateFormat, { variant: 'year', locale: language, system: {} })}</span>
            <ChevronRight size={16} className={styles.chevron} aria-hidden />
          </>
        );
        return (
          <li key={entry.id}>
            {entryHref
              ? <a className={className} href={entryHref(entry)}>{body}</a>
              : (
                <button type="button" className={className} data-entry-id={entry.id} onClick={() => onOpen?.(entry)}>
                  {body}
                </button>
              )}
          </li>
        );
      })}
    </ol>
  );
}
