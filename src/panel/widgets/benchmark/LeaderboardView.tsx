import { Fragment, useEffect, useState } from 'react';
import { Trophy, ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { getLeaderboard, getLastSubmissionId } from '../../../api/nexusApi';
import type { LeaderboardEntry, LeaderboardResponse } from '../../../types/benchmark';
import { EmptyState } from '../../../components/common/EmptyState/EmptyState';
import { Select } from '../../../components/common/Select/Select';
import styles from './LeaderboardView.module.scss';

export function LeaderboardView() {
  const { t } = useTranslation();
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [scoringVersion, setScoringVersion] = useState('');
  const [allVersions, setAllVersions] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const myId = getLastSubmissionId();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    const params = scoringVersion ? { scoringVersion } : {};
    void getLeaderboard(params).then(res => {
      if (cancelled) return;
      if (res === null) {
        setError(true);
        setData(null);
      } else {
        setData(res);
        setError(false);
        if (!scoringVersion) {
          setAllVersions(Array.from(new Set(res.entries.map(e => e.scoringVersion))).sort());
        }
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [scoringVersion]);

  const toggleRow = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  const versionOptions = [
    { value: '', label: t('benchmark.leaderboard.version') },
    ...allVersions.map(v => ({ value: v, label: v })),
  ];

  return (
    <section className={styles.leaderboard}>
      <div className={styles.filters}>
        <label className={styles.filterLabel}>
          {t('benchmark.leaderboard.filterVersion')}
        </label>
        <Select
          value={scoringVersion}
          onChange={setScoringVersion}
          options={versionOptions}
          ariaLabel={t('benchmark.leaderboard.filterVersion')}
        />
      </div>

      <div className={styles.body}>
        {loading && (
          <div className={styles.loadingMsg} role="status">{t('benchmark.leaderboard.loading')}</div>
        )}

        {!loading && error && (
          <EmptyState
            icon={<Trophy size={32} />}
            title={t('benchmark.leaderboard.error')}
          />
        )}

        {!loading && !error && (!data || data.entries.length === 0) && (
          <EmptyState
            icon={<Trophy size={32} />}
            title={t('benchmark.leaderboard.empty')}
          />
        )}

        {!loading && !error && data && data.entries.length > 0 && (
          <table className={styles.table} aria-label={t('benchmark.leaderboard.title')}>
            <thead>
              <tr>
                <th className={styles.thRank}>{t('benchmark.leaderboard.rank')}</th>
                <th className={styles.thScore}>{t('benchmark.leaderboard.score')}</th>
                <th className={styles.thHardware}>{t('benchmark.leaderboard.hardware')}</th>
                <th className={styles.thDate}>{t('benchmark.leaderboard.date')}</th>
                <th className={styles.thExpand} aria-hidden />
              </tr>
            </thead>
            <tbody>
              {data.entries.map(entry => {
                const isOwn = entry.id === myId;
                const isExpanded = expandedId === entry.id;
                return (
                  <Fragment key={entry.id}>
                    <tr
                      className={`${styles.row} ${isOwn ? styles.rowOwn : ''}`}
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      onClick={() => toggleRow(entry.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleRow(entry.id);
                        }
                      }}
                    >
                      <td className={styles.tdRank}>
                        <span className={styles.rankNum}>#{entry.rank}</span>
                        {isOwn && (
                          <span className={styles.ownBadge}>{t('benchmark.leaderboard.yourEntry')}</span>
                        )}
                      </td>
                      <td className={styles.tdScore}>{Math.round(entry.composite)}</td>
                      <td className={styles.tdHardware}>
                        <div className={styles.hwName}>{entry.displayName ?? t('benchmark.leaderboard.anonymous')}</div>
                        <div className={styles.hwPrimary}>{entry.hardware.cpuModel}</div>
                        {entry.hardware.gpuModels.length > 0 && (
                          <div className={styles.hwSecondary}>{entry.hardware.gpuModels[0]}</div>
                        )}
                      </td>
                      <td className={styles.tdDate}>
                        {new Date(entry.createdAt).toLocaleDateString()}
                      </td>
                      <td className={styles.tdExpand} aria-hidden>
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className={styles.detailRow}>
                        <td colSpan={5}>
                          <EntryDetail entry={entry} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function EntryDetail({ entry }: { entry: LeaderboardEntry }) {
  const { t } = useTranslation();

  const axes: Array<{ key: keyof Pick<LeaderboardEntry, 'cpu' | 'gpu' | 'ram' | 'storage'>; label: string }> = [
    { key: 'cpu', label: 'CPU' },
    { key: 'gpu', label: 'GPU' },
    { key: 'ram', label: 'RAM' },
    { key: 'storage', label: 'Storage' },
  ];

  return (
    <div className={styles.detail}>
      <div className={styles.detailSection}>
        <div className={styles.detailTitle}>{t('benchmark.leaderboard.hardware')}</div>
        <ul className={styles.detailList}>
          <li><span className={styles.detailKey}>CPU</span> {entry.hardware.cpuModel}</li>
          {entry.hardware.gpuModels.map((g, i) => (
            <li key={i}><span className={styles.detailKey}>GPU</span> {g}</li>
          ))}
          <li><span className={styles.detailKey}>RAM</span> {entry.hardware.ramModel}</li>
          {/* eslint-disable-next-line i18next/no-literal-string -- Storage is a hardware category proper noun */}
          <li><span className={styles.detailKey}>Storage</span> {entry.hardware.storageModel}</li>
          <li><span className={styles.detailKey}>{t('benchmark.leaderboard.os')}</span> {entry.hardware.os}</li>
          <li>
            {t('benchmark.leaderboard.cores', { n: String(entry.hardware.logicalCores) })}
          </li>
        </ul>
      </div>

      <div className={styles.detailSection}>
        <div className={styles.detailTitle}>{t('benchmark.leaderboard.score')}</div>
        <ul className={styles.detailList}>
          {axes.map(({ key, label }) => {
            const axis = entry[key];
            return (
              <li key={key}>
                <span className={styles.detailKey}>{label}</span>
                {' '}{axis.raw.toFixed(1)} {axis.unit}
                <span className={styles.axisScore}> ({Math.round(axis.score)})</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className={styles.detailSection}>
        <div className={styles.detailTitle}>{t('benchmark.leaderboard.version')}</div>
        <div className={styles.detailValue}>{entry.scoringVersion}</div>
      </div>
    </div>
  );
}
