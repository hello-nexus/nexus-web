import { useState } from 'react';
import styles from './Avatar.module.scss';

export interface AvatarProps {
  /** Display name; drives the initial-letter fallback and the alt/label text. */
  name: string;
  src?: string | null;
  /** Diameter in px. Defaults to the design system's control-avatar size. */
  size?: number;
  className?: string;
}

/**
 * Circular avatar. Renders `src` when present; falls back to the first
 * letter of `name` over an accent-filled circle when `src` is absent or
 * fails to load (e.g. a stale R2 URL).
 */
export function Avatar({ name, src, size = 36, className }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const style = { width: size, height: size, fontSize: size * 0.42 };

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name}
        className={`${styles.root} ${className ?? ''}`}
        style={style}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className={`${styles.root} ${styles.fallback} ${className ?? ''}`}
      style={style}
      role="img"
      aria-label={name}
    >
      {initial}
    </div>
  );
}
