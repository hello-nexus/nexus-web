import { SquareDashed } from 'lucide-react';
import styles from './BlankWidget.module.scss';

export function BlankWidget() {
  return null;
}

// Catalog tile only: an empty card would read as a widget that failed to load.
export function BlankPreview() {
  return (
    <div className={styles.preview}>
      <SquareDashed className={styles.icon} aria-hidden />
    </div>
  );
}
