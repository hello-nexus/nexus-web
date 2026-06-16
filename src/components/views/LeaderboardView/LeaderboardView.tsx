import { useEffect, useState } from 'react';
import { Trophy, ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { getLeaderboard, getLastSubmissionId } from '../../../api/nexusApi';
import type { LeaderboardEntry, LeaderboardResponse } from '../../../types/benchmark';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { HoverTooltip } from '../../common/HoverTooltip/HoverTooltip';
import styles from './LeaderboardView.module.scss';

interface LeaderboardViewProps {
  onBack?: () => void;
}

export function LeaderboardView({ onBack }: LeaderboardViewProps) {
  const { t } = useTranslation();
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [scoringVersion, setScoringVersion] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const myId = getLastSubmissionId();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = scoringVersion ? { scoringVersion } : {};
    void getLeaderboard(params).then(res => {
      if (cancelled) return;
      setData(res);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [scoringVersion]);

  const versions = data
    ? Array.from(new Set(data.entries.map(e => e.scoringVersion))).sort()
    : [];

  const toggleRow = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  return (
    <section className={styles.leaderboard}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          {onBack && (
            <button type="button" className={styles.backBtn} onClick={onBack}>
              {t('benchmark.leaderboard.back')}
            </button>
          )}
          <div className={styles.titleGroup}>
            <Trophy size={22} />
            <h2>{t('benchmark.leaderboard.title')}</h2>
          </div>
        </div>

        <div className={styles.filters}>
          <label className={styles.filterLabel} htmlFor="lb-version">
            {t('benchmark.leaderboard.filterVersion')}
          </label>
          <select
            id="lb-version"
            className={styles.filterSelect}
            value={scoringVersion}
            onChange={e => setScoringVersion(e.target.value)}
          >
            <option value="">{t('benchmark.leaderboard.version')}</option>
            {versions.map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
      </header>

      <div className={styles.body}>
        {loading && (
          <div className={styles.loadingMsg} role="status">{t('benchmark.leaderboard.loading')}</div>
        )}

        {!loading && (!data || data.entries.length === 0) && (
          <EmptyState
            icon={<Trophy size={32} />}
            title={t('benchmark.leaderboard.empty')}
          />
        )}

        {!loading && data && data.entries.length > 0 && (
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
                  <>
                    <tr
                      key={entry.id}
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
                      <tr key={`${entry.id}-detail`} className={styles.detailRow}>
                        <td colSpan={5}>
                          <EntryDetail entry={entry} />
                        </td>
                      </tr>
                    )}
                  </>
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

  const toolEntries = Object.entries(entry.tools);

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

      {toolEntries.length > 0 && (
        <div className={styles.detailSection}>
          <div className={styles.detailTitle}>{t('benchmark.leaderboard.tools')}</div>
          <ul className={styles.detailList}>
            {toolEntries.map(([name, version]) => (
              <li key={name}>
                <HoverTooltip body={version}>
                  <span className={styles.toolName}>{name}</span>
                </HoverTooltip>
                {' '}{version}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.detailSection}>
        <div className={styles.detailTitle}>{t('benchmark.leaderboard.version')}</div>
        <div className={styles.detailValue}>{entry.scoringVersion}</div>
      </div>
    </div>
  );
}
