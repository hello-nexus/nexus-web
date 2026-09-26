import type { ReactNode } from 'react';
import { useTranslation } from '../../../lib/i18n';
import {
  DEFAULT_DATE_FORMAT, DEFAULT_NUMBER_FORMAT, formatDate, localizeNumbers,
  type DateFormat, type NumberFormat,
} from '../../../lib/units';
import type { LeaderboardEntry } from '../../../types/benchmark';
import { SectionHeader } from '../../../components/common/SectionHeader/SectionHeader';
import styles from './BenchmarkEntryDetail.module.scss';

// Hardware-category acronyms plus "Storage" stay untranslated.
const AXES = [
  { key: 'cpu', label: 'CPU' },
  { key: 'gpu', label: 'GPU' },
  { key: 'ram', label: 'RAM' },
  { key: 'storage', label: 'Storage' },
] as const;

interface BenchmarkEntryDetailProps {
  /** `percentile` comes only from the single-entry endpoint (the Build portal's /bench/:id). */
  entry: LeaderboardEntry & { percentile?: number };
  /** Headline actions; each surface wires its own navigation. */
  actions?: ReactNode;
  /** The owner's public profile; the name renders as plain text without it. */
  ownerHref?: string;
  ownerNewTab?: boolean;
  /** The owner name is the page's h1 (the Build portal's /bench/:id); otherwise an h2 under the app's page title. */
  ownerIsPageTitle?: boolean;
  /** Passed in, not read via useUnitPrefs: that hook's module drags the app's widget graph into the Build portal. */
  numberFormat?: NumberFormat;
  dateFormat?: DateFormat;
}

/**
 * One leaderboard entry: composite + rank headline, per-axis cards, hardware,
 * tools and scoring version. Shared with the Build portal through @app.
 */
export function BenchmarkEntryDetail({
  entry, actions, ownerHref, ownerNewTab, ownerIsPageTitle, numberFormat = DEFAULT_NUMBER_FORMAT, dateFormat = DEFAULT_DATE_FORMAT,
}: BenchmarkEntryDetailProps) {
  const { t, language } = useTranslation();
  const owner = entry.displayName ?? t('benchmark.leaderboard.anonymous');
  const OwnerHeading = ownerIsPageTitle ? 'h1' : 'h2';
  const tools = Object.entries(entry.tools);

  return (
    <div className={styles.detail}>
      <header className={styles.headline}>
        <div className={styles.composite}>
          <span className={styles.compositeValue}>{Math.round(entry.composite)}</span>
          <span className={styles.compositeLabel}>{t('benchmark.detail.nexusScore')}</span>
        </div>
        <div className={styles.meta}>
          <OwnerHeading className={styles.owner}>
            {entry.displayName && ownerHref
              ? (
                <a
                  className={styles.ownerLink}
                  href={ownerHref}
                  target={ownerNewTab ? '_blank' : undefined}
                  rel={ownerNewTab ? 'noopener noreferrer' : undefined}
                >
                  {owner}
                </a>
              )
              : owner}
          </OwnerHeading>
          <div className={styles.badges}>
            <span className={styles.badge}>{t('benchmark.leaderboard.rank')} #{entry.rank}</span>
            {entry.percentile != null && (
              <span className={`${styles.badge} ${styles.percentile}`}>
                {t('benchmark.detail.beats', { value: String(Math.round(entry.percentile)) })}
              </span>
            )}
          </div>
          <span className={styles.submitted}>
            {t('benchmark.detail.submitted', { date: formatDate(new Date(entry.createdAt), dateFormat, { variant: 'year', locale: language, system: {} }) })}
          </span>
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </header>

      <section className={styles.section}>
        <SectionHeader>{t('benchmark.detail.scoreBreakdown')}</SectionHeader>
        <div className={styles.axisGrid}>
          {AXES.map(({ key, label }) => {
            const axis = entry[key];
            return (
              <div key={key} className={styles.card}>
                <span className={styles.axisLabel}>{label}</span>
                <span className={styles.axisScore}>{Math.round(axis.score)}</span>
                <span className={styles.axisRaw}>
                  {localizeNumbers(axis.raw.toFixed(1), numberFormat)} {axis.unit}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className={styles.section}>
        <SectionHeader>{t('benchmark.leaderboard.hardware')}</SectionHeader>
        <ul className={`${styles.card} ${styles.hardwareList}`}>
          <li><span className={styles.hwKey}>CPU</span>{entry.hardware.cpuModel}</li>
          {entry.hardware.gpuModels.map((gpu, i) => (
            <li key={i}><span className={styles.hwKey}>GPU</span>{gpu}</li>
          ))}
          <li><span className={styles.hwKey}>RAM</span>{entry.hardware.ramModel}</li>
          {/* eslint-disable-next-line i18next/no-literal-string -- Storage is a hardware category proper noun */}
          <li><span className={styles.hwKey}>Storage</span>{entry.hardware.storageModel}</li>
          <li><span className={styles.hwKey}>{t('benchmark.leaderboard.os')}</span>{entry.hardware.os}</li>
          <li>{t('benchmark.leaderboard.cores', { n: String(entry.hardware.logicalCores) })}</li>
        </ul>
      </section>

      <footer className={styles.footer}>
        {tools.length > 0 && (
          <div className={styles.footerBlock}>
            <span className={styles.footerLabel}>{t('benchmark.leaderboard.tools')}</span>
            <span className={styles.footerValue}>
              {tools.map(([name, version]) => `${name} ${version}`).join(', ')}
            </span>
          </div>
        )}
        <div className={styles.footerBlock}>
          <span className={styles.footerLabel}>{t('benchmark.leaderboard.version')}</span>
          <span className={styles.footerValue}>{entry.scoringVersion}</span>
        </div>
      </footer>
    </div>
  );
}
