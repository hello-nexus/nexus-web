import { RotateCw } from 'lucide-react';
import styles from './RotatePrompt.module.scss';

export interface RotatePromptProps {
  message: string;
  /** Tile-face variant is compact; the in-game variant covers the whole board. */
  compact?: boolean;
}

/**
 * "Rotate to portrait" prompt shared by the panel games: shown on the tile
 * face while the surface is landscape, and as a pause overlay when a game in
 * progress flips to landscape mid-session.
 */
export function RotatePrompt({ message, compact = false }: RotatePromptProps) {
  return (
    <div className={styles.root} data-compact={compact ? 'true' : undefined} role="status">
      <RotateCw size={compact ? 20 : 32} className={styles.icon} aria-hidden />
      <p className={styles.message}>{message}</p>
    </div>
  );
}
