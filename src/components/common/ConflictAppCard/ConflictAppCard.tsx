import type { DetectedConflict } from '../../../api/conflicts';
import { EndTaskButton } from '../EndTaskButton/EndTaskButton';
import { useTranslation } from '../../../lib/i18n';
import styles from './ConflictAppCard.module.scss';

interface ConflictAppCardProps {
  conflict: DetectedConflict;
}

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

const KNOWN_CATEGORIES = new Set(['lighting', 'cooling', 'peripherals', 'monitoring']);

function translateCategory(t: TranslateFn, category: string): string {
  // A category with no matching locale string falls back to the raw value
  // instead of showing "conflicts.category.foo".
  if (KNOWN_CATEGORIES.has(category)) {
    return t(`conflicts.category.${category}`);
  }
  return category;
}

/**
 * Name + category/process/PID meta row for a single detected conflicting
 * app, with an End Task action. Used by ConflictWarningModal (one per
 * detected conflict) and the device-page NexusControlOff gate (the single
 * conflict blocking that device).
 */
export function ConflictAppCard({ conflict }: ConflictAppCardProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.row}>
      <div className={styles.rowMain}>
        <div className={styles.rowName}>{conflict.displayName}</div>
        <div className={styles.rowMeta}>
          <span className={styles.rowCategory}>{translateCategory(t, conflict.category)}</span>
          <span className={styles.rowDot} aria-hidden>·</span>
          <span className={styles.rowProcess}>{conflict.processName}</span>
          <span className={styles.rowDot} aria-hidden>·</span>
          <span className={styles.rowPid}>PID {conflict.pid}</span>
        </div>
      </div>
      <EndTaskButton conflictId={conflict.id} />
    </div>
  );
}
