import type { ReactNode } from 'react';
import { Clock, Trophy } from 'lucide-react';
import { formatGameDuration } from './formatGameDuration';
import styles from './GameHud.module.scss';

export interface GameHudLabels {
  score: string;
  time: string;
}

export interface GameHudProps {
  // Callers own translation. The inline layout expects the whole readout;
  // the labeled layout takes the bare value, with the word in `labels.score`.
  scoreText: string;
  elapsedMs: number;
  // Extra chip(s) between score and time - blocks' level/combo readouts.
  middle?: ReactNode;
  // Merged onto the root - lets a caller embed the bar in its own row
  // (e.g. beside a next-piece preview) without forking this component.
  className?: string;
  // Passing labels switches the bar to the two-line layout: a header line of
  // column labels over a line of values, dropping the inline icons. Every
  // column is an equal grid track, so a value changing width (or a combo chip
  // appearing) never moves the other columns.
  labels?: GameHudLabels;
  // Trailing column, after time - blocks' next-piece preview. Labeled layout
  // only; the inline bar has no room for it.
  trailing?: ReactNode;
}

export interface GameHudStatProps {
  label: string;
  children: ReactNode;
}

/** One labeled column of the two-line HUD, for a caller's own readouts. */
export function GameHudStat({ label, children }: GameHudStatProps) {
  return (
    <span className={styles.column}>
      <span className={styles.columnLabel}>{label}</span>
      <span className={styles.columnValue}>{children}</span>
    </span>
  );
}

/** Shared panel-themed score/time bar for the panel games' in-game HUD. */
export function GameHud({ scoreText, elapsedMs, middle, className, labels, trailing }: GameHudProps) {
  const rootClass = className ? `${styles.hud} ${className}` : styles.hud;

  if (labels) {
    return (
      <div className={rootClass} data-panel-game-hud="true" data-hud-layout="labeled">
        <GameHudStat label={labels.score}>{scoreText}</GameHudStat>
        {middle}
        <GameHudStat label={labels.time}>{formatGameDuration(elapsedMs)}</GameHudStat>
        {trailing}
      </div>
    );
  }

  return (
    <div className={rootClass} data-panel-game-hud="true">
      <span className={styles.stat}>
        <Trophy size={13} aria-hidden />
        {scoreText}
      </span>
      {middle}
      <span className={styles.stat}>
        <Clock size={13} aria-hidden />
        {formatGameDuration(elapsedMs)}
      </span>
    </div>
  );
}
