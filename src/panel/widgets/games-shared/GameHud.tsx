import type { ReactNode } from 'react';
import { Clock, Trophy } from 'lucide-react';
import { formatGameDuration } from './formatGameDuration';
import styles from './GameHud.module.scss';

export interface GameHudProps {
  // Callers own translation - a fully-resolved string (e.g. "Score: 120"),
  // matching the labels idiom the rest of games-shared uses.
  scoreText: string;
  elapsedMs: number;
  // Extra chip(s) between score and time - blocks' level/combo readouts.
  middle?: ReactNode;
}

/** Shared panel-themed score/time bar for the panel games' in-game HUD. */
export function GameHud({ scoreText, elapsedMs, middle }: GameHudProps) {
  return (
    <div className={styles.hud}>
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
