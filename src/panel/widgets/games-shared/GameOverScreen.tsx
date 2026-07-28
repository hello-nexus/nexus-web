import { useState } from 'react';
import { ChevronLeft, Medal, Sparkles, TriangleAlert, Trophy } from 'lucide-react';
import { Badge } from '../../../components/common/Badge/Badge';
import { Button } from '../../../components/common/Button/Button';
import { EmptyState } from '../../../components/common/EmptyState/EmptyState';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { formatNumber, type NumberFormat } from '../../../lib/units';
import { formatGameDuration } from './formatGameDuration';
import type { GameScoreSubmissionStatus } from './useGameScoreSubmission';
import type { GameLeaderboardEntry } from '../../../types/games';
import styles from './GameOverScreen.module.scss';

export interface GameOverLabels {
  title: string;
  scoreLabel: string;
  timeLabel: string;
  newBest: string;
  leaderboardTitle: string;
  back: string;
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
  // True when this run beat the previously stored local best.
  isNewBest?: boolean;
  // Snake-only chip alongside elapsed time; omitted (no chip) for blocks.
  difficultyLabel?: string;
  status: GameScoreSubmissionStatus;
  entries: GameLeaderboardEntry[] | null;
  selfRank: number | null;
  onPlayAgain: () => void;
}

type Stage = 'results' | 'leaderboard';

/**
 * Shared game-over flow for the panel games: a results stage (hero score,
 * new-best badge, play-again/leaderboard actions) and a leaderboard stage
 * reached from the secondary button. Callers own translation: every label
 * arrives pre-resolved from the calling widget's own i18n namespace so this
 * component stays generic. Submission itself (useGameScoreSubmission) is
 * driven by the caller and unaffected by which stage is showing.
 */
export function GameOverScreen({
  labels, score, elapsedMs, isNewBest = false, difficultyLabel, status, entries, selfRank, onPlayAgain,
}: GameOverScreenProps) {
  const [stage, setStage] = useState<Stage>('results');
  const { numberFormat } = useUnitPrefs();

  if (stage === 'leaderboard') {
    return (
      // Remounting (not just re-rendering) on stage change replays the
      // `stageIn` entrance animation and resets the leaderboard's scroll
      // position each time it opens.
      <div key="leaderboard" className={styles.root} data-stage="leaderboard">
        <div className={styles.leaderboardHeader}>
          <Button
            tone="ghost"
            icon={<ChevronLeft size={18} aria-hidden />}
            className={styles.backButton}
            onClick={() => setStage('results')}
          >
            {labels.back}
          </Button>
          <div className={styles.leaderboardHeaderTitle}>
            <Trophy size={15} aria-hidden />
            {labels.leaderboardTitle}
          </div>
        </div>
        <div className={styles.leaderboardBody}>
          <GameLeaderboardList
            status={status}
            entries={entries}
            selfRank={selfRank}
            labels={labels}
            numberFormat={numberFormat}
          />
        </div>
      </div>
    );
  }

  return (
    <div key="results" className={styles.root} data-stage="results">
      <div className={styles.resultsGroup}>
        <div className={styles.summary}>
          {isNewBest && (
            <div className={styles.newBestBadge}>
              <Badge label={labels.newBest} color="var(--warn)" icon={<Sparkles size={11} aria-hidden />} />
            </div>
          )}
          <div className={styles.title}>{labels.title}</div>
          <div className={styles.score}>{formatNumber(score, numberFormat)}</div>
          <div className={styles.scoreLabel}>{labels.scoreLabel}</div>
          <div className={styles.chips}>
            <span className={styles.chip}>{labels.timeLabel}: {formatGameDuration(elapsedMs)}</span>
            {difficultyLabel && <span className={styles.chip}>{difficultyLabel}</span>}
          </div>
        </div>

        <div className={styles.actions}>
          <Button tone="accent" size="lg" className={styles.actionButton} onClick={onPlayAgain}>
            {labels.playAgain}
          </Button>
          <Button
            tone="neutral"
            size="lg"
            icon={<Trophy size={16} aria-hidden />}
            className={styles.actionButton}
            onClick={() => setStage('leaderboard')}
          >
            {labels.leaderboardTitle}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface GameLeaderboardListProps {
  status: GameScoreSubmissionStatus;
  entries: GameLeaderboardEntry[] | null;
  selfRank: number | null;
  labels: GameOverLabels;
  numberFormat: NumberFormat;
}

function GameLeaderboardList({ status, entries, selfRank, labels, numberFormat }: GameLeaderboardListProps) {
  if (status === 'error') {
    return (
      <div className={styles.errorLine} role="status">
        <TriangleAlert size={14} aria-hidden />
        {labels.error}
      </div>
    );
  }

  if (status === 'done' && entries && entries.length === 0) {
    return <EmptyState compact icon={<Trophy size={24} />} title={labels.empty} />;
  }

  if (status === 'done' && entries && entries.length > 0) {
    return (
      <ol className={styles.list}>
        {entries.map(entry => {
          const isOwn = selfRank !== null && entry.rank === selfRank;
          const medalRank = entry.rank <= 3 ? entry.rank : undefined;
          return (
            <li
              key={entry.rank}
              className={styles.row}
              data-own={isOwn ? 'true' : undefined}
              data-rank={medalRank}
            >
              <span className={styles.rank}>
                {medalRank && <Medal size={12} className={styles.medalIcon} aria-hidden />}
                {entry.rank}
              </span>
              <span className={styles.name}>
                <span className={entry.username === null ? styles.nameAnonymous : undefined}>
                  {entry.username ?? labels.anonymous}
                </span>
                {isOwn && <Badge compact label={labels.yourEntry} color="var(--accent-glow)" />}
              </span>
              <span className={styles.rowScore}>{formatNumber(entry.score, numberFormat)}</span>
            </li>
          );
        })}
      </ol>
    );
  }

  // idle / submitting: skeleton rows instead of a spinner-only void.
  return (
    <div className={styles.skeleton} role="status" aria-label={labels.loading}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className={styles.skeletonRow} />
      ))}
    </div>
  );
}
