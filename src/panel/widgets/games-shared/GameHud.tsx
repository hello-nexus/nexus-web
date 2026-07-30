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
  // Merged onto the root - lets a caller embed the bar in its own row
  // (e.g. beside a next-piece preview) without forking this component.
  className?: string;
}

/** Shared panel-themed score/time bar for the panel games' in-game HUD. */
export function GameHud({ scoreText, elapsedMs, middle, className }: GameHudProps) {
  return (
    <div className={className ? `${styles.hud} ${className}` : styles.hud} data-panel-game-hud="true">
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
