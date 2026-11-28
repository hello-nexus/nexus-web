import { resolveListIcon } from './reminderIcons';
import styles from './ReminderIconGlyph.module.scss';

/** A list's icon: a Lucide glyph takes the surrounding color, an emoji is drawn as is. */
export function ReminderIconGlyph({ iconKey, size = '1.25em' }: { iconKey: string; size?: string }) {
  const icon = resolveListIcon(iconKey);
  if (icon.kind === 'emoji') return <span className={styles.emoji} aria-hidden>{icon.glyph}</span>;
  return <icon.Icon size={size} aria-hidden />;
}
