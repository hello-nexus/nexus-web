import { Trophy } from 'lucide-react';
import { Button } from '../../../components/common/Button/Button';
import { EmptyState } from '../../../components/common/EmptyState/EmptyState';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { formatNumber } from '../../../lib/units';
import { formatGameDuration } from './formatGameDuration';
import type { GameScoreSubmissionStatus } from './useGameScoreSubmission';
import type { GameLeaderboardEntry } from '../../../types/games';
import styles from './GameOverScreen.module.scss';

export interface GameOverLabels {
  title: string;
  scoreLabel: string;
  timeLabel: string;
  leaderboardTitle: string;
  anonymous: string;
  loading: string;
  error: string;
  empty: string;
  playAgain: string;
  yourEntry: string;
}

export interface GameOverScreenProps {
  labels: GameOverLabels;
  score: number;
  elapsedMs: number;
  status: GameScoreSubmissionStatus;
  entries: GameLeaderboardEntry[] | null;
  selfRank: number | null;
  onPlayAgain: () => void;
}

/**
 * Shared score + cloud leaderboard + play-again screen for the panel games.
 * Callers own translation: every label arrives pre-resolved from the calling
 * widget's own i18n namespace so this component stays generic.
 */
export function GameOverScreen({ labels, score, elapsedMs, status, entries, selfRank, onPlayAgain }: GameOverScreenProps) {
  const { numberFormat } = useUnitPrefs();
  return (
    <div className={styles.root}>
      <div className={styles.summary}>
        <div className={styles.title}>{labels.title}</div>
        <div className={styles.score}>{formatNumber(score, numberFormat)}</div>
        <div className={styles.meta}>
          <span>{labels.scoreLabel}</span>
          <span className={styles.metaSep} aria-hidden>&middot;</span>
          <span>{labels.timeLabel}: {formatGameDuration(elapsedMs)}</span>
        </div>
      </div>

      <div className={styles.board}>
        <div className={styles.boardTitle}>
          <Trophy size={14} aria-hidden />
          {labels.leaderboardTitle}
        </div>
        {status === 'submitting' && (
          <div className={styles.status} role="status">{labels.loading}</div>
        )}
        {status === 'error' && (
          <div className={styles.errorLine} role="status">{labels.error}</div>
        )}
        {status === 'done' && entries && entries.length === 0 && (
          <EmptyState compact icon={<Trophy size={24} />} title={labels.empty} />
        )}
        {status === 'done' && entries && entries.length > 0 && (
          <ol className={styles.list}>
            {entries.map(entry => (
              <li
                key={entry.rank}
                className={styles.row}
                data-own={selfRank !== null && entry.rank === selfRank ? 'true' : undefined}
              >
                <span className={styles.rank}>{entry.rank}</span>
                <span className={styles.name}>
                  {entry.username ?? labels.anonymous}
                  {selfRank !== null && entry.rank === selfRank && (
                    <span className={styles.ownBadge}>{labels.yourEntry}</span>
                  )}
                </span>
                <span className={styles.rowScore}>{formatNumber(entry.score, numberFormat)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <Button tone="accent" size="lg" onClick={onPlayAgain}>
        {labels.playAgain}
      </Button>
    </div>
  );
}
