import { useState, type CSSProperties } from 'react';
import { Boxes } from 'lucide-react';
import styles from './AppIconTile.module.scss';

interface AppIconTileProps {
  /** Resolved image URL; null draws the placeholder. */
  src: string | null;
  /** Edge length in px. */
  size: number;
  className?: string;
}

/**
 * A Marketplace app's icon. The icon is its own tile, so it only gets rounded
 * corners; an app without one, or whose image fails to load, gets a
 * placeholder glyph instead of an empty box.
 */
export function AppIconTile({ src, size, className }: AppIconTileProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const icon = src && src !== failed ? src : null;
  const style = { '--app-icon-size': `${size}px` } as CSSProperties;
  return (
    <span
      className={[styles.tile, icon ? '' : styles.empty, className ?? ''].filter(Boolean).join(' ')}
      style={style}
      data-placeholder={icon ? undefined : 'true'}
    >
      {icon
        ? <img src={icon} alt="" className={styles.image} onError={() => setFailed(icon)} />
        : <Boxes className={styles.fallback} aria-hidden={true} />}
    </span>
  );
}
