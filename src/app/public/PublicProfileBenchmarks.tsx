import { ExternalLink } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { SectionHeader } from '../../components/common/SectionHeader/SectionHeader';
import type { PublicAccountBenchmarks } from '../../api/account';
import styles from './PublicProfileBenchmarks.module.scss';

// Absolute so the link works regardless of which origin renders this
// component (hellonexus.com itself, or a diverged copy hosted elsewhere).
const BUILD_ORIGIN = 'https://build.hellonexus.com';

function benchUrl(id: string): string {
  return `${BUILD_ORIGIN}/bench/${encodeURIComponent(id)}`;
}

/**
 * Consumed through @app by the Build portal's profile page; nothing inside
 * this repo imports it.
 *
 * Public profile "Benchmarks" section: best score headline + recent runs,
 * each linking out to its full result on build.hellonexus.com. `benchmarks`
 * is always present on a public profile, but `best` is null for an account
 * with no linked submissions - in which case this renders nothing.
 */
export function PublicProfileBenchmarks({ benchmarks }: { benchmarks: PublicAccountBenchmarks }) {
  const { t } = useTranslation();
  if (!benchmarks.best) return null;
  return (
    <div className={styles.section}>
      <SectionHeader>{t('publicProfile.benchmarks.title')}</SectionHeader>
      <a
        className={styles.best}
        href={benchUrl(benchmarks.best.id)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('publicProfile.benchmarks.viewLabel')}
      >
        <span className={styles.bestLabel}>{t('publicProfile.benchmarks.best')}</span>
        <span className={styles.bestScore}>{Math.round(benchmarks.best.composite)}</span>
        <ExternalLink size={14} aria-hidden />
      </a>
      {benchmarks.recent.length > 0 && (
        <div className={styles.recent}>
          <div className={styles.recentTitle}>{t('publicProfile.benchmarks.recent')}</div>
          <ul className={styles.recentList}>
            {benchmarks.recent.map((entry) => (
              <li key={entry.id}>
                <a
                  className={styles.recentLink}
                  href={benchUrl(entry.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t('publicProfile.benchmarks.viewLabel')}
                >
                  <span className={styles.recentScore}>{Math.round(entry.composite)}</span>
                  <span className={styles.recentHardware}>{entry.cpuModel}</span>
                  <span className={styles.recentDate}>{new Date(entry.createdAt).toLocaleDateString()}</span>
                  <ExternalLink size={12} aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
