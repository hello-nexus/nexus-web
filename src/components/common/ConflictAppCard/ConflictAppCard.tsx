import type { DetectedConflict } from '../../../api/conflicts';
import { EndTaskButton } from '../EndTaskButton/EndTaskButton';
import { useTranslation } from '../../../lib/i18n';
import styles from './ConflictAppCard.module.scss';

interface ConflictAppCardProps {
  conflict: DetectedConflict;
}

/**
 * Name + executable/PID meta row for a single detected conflicting app, with
 * an End Task action. Used by ConflictWarningModal (one per detected conflict),
 * ConflictOnboardingScreen, and the device-page NexusControlOff gate (the
 * single conflict blocking that device).
 */
export function ConflictAppCard({ conflict }: ConflictAppCardProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.row}>
      <div className={styles.rowMain}>
        <div className={styles.rowName}>{conflict.displayName}</div>
        <div className={styles.rowMeta}>
          {/* No category: the catalog's guess at what an app drives is often
              wrong, and the executable is what the user can actually check. */}
          <span className={styles.rowProcess}>{conflict.processName}</span>
          <span className={styles.rowPid}>{t('conflicts.modal.pid', { pid: conflict.pid })}</span>
        </div>
      </div>
      <div className={styles.rowActions}>
        <EndTaskButton conflictId={conflict.id} pid={conflict.pid} />
      </div>
    </div>
  );
}
