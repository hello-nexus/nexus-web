import type { LucideIcon } from 'lucide-react';
import styles from './DomainGlyph.module.scss';

export interface DomainGlyphProps {
  icon: LucideIcon;
  size?: number;
}

// Large faint icon silhouette bled off a card's edge, behind its content.
// The host card supplies position: relative; overflow: hidden; isolation:
// isolate so this glyph's negative z-index paints above the card surface but
// beneath the card's own text.
export function DomainGlyph({ icon: Icon, size = 136 }: DomainGlyphProps) {
  return <Icon className={styles.glyph} size={size} strokeWidth={1.5} aria-hidden={true} />;
}
