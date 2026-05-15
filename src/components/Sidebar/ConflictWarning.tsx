import { useCallback, useState } from 'react';
import { AlertTriangle, CheckCircle2, ShieldOff } from 'lucide-react';
import classNames from 'classnames';
import type { DetectedConflict } from '../../api/conflicts';
import { killConflict } from '../../api/conflicts';
import { Button } from '../Button/Button';
import { DeviceModal } from '../DeviceModal/DeviceModal';
import { useTranslation } from '../../lib/i18n';
import styles from './ConflictWarning.module.scss';

interface ConflictWarningProps {
  conflicts: readonly DetectedConflict[];
  compact: boolean;
  /**
   * Persist the "don't show conflict warnings" preference. Called when the
   * user ticks the "Don't show this again" checkbox inside the modal.
   * The parent owns the preference (it lives in QosSettings.Ui), so the
   * badge stays purely presentational.
   */
  onDismissForever: () => void;
}

/**
 * Bottom-left amber badge that opens the conflict modal. The badge button
 * is hidden when there are no conflicts, but the modal stays mounted as
 * long as the user has it open — that way the modal doesn't auto-close
 * mid-read when the watcher clears the last conflict; instead it transitions
 * to an "all clear" empty state until the user dismisses it.
 */
export function ConflictWarningBadge({ conflicts, compact, onDismissForever }: ConflictWarningProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const count = conflicts.length;

  // Nothing to show: no badge and no open modal → render nothing so the
  // sidebar footer collapses cleanly.
  if (count === 0 && !open) return null;

  const label = t('conflicts.badge.label', { count });

  return (
    <div className={classNames(styles.wrap, { [styles.wrapCompact]: compact })}>
      {count > 0 && (
        <button
          type="button"
          className={classNames(styles.badge, { [styles.badgeCompact]: compact })}
          onClick={() => setOpen(true)}
          title={compact ? label : undefined}
          aria-label={label}
        >
          <span className={styles.icon}>
            <AlertTriangle size={16} />
          </span>
          {!compact && (
            <>
              <span className={styles.text}>{t('conflicts.badge.text')}</span>
              <span className={styles.count}>{count}</span>
            </>
          )}
          {compact && <span className={styles.compactDot}>{count}</span>}
        </button>
      )}
      <ConflictWarningModal
        open={open}
        conflicts={conflicts}
        onClose={() => setOpen(false)}
        onDismissForever={() => {
          onDismissForever();
          setOpen(false);
        }}
      />
    </div>
  );
}

interface ConflictWarningModalProps {
  open: boolean;
  conflicts: readonly DetectedConflict[];
  onClose: () => void;
  onDismissForever: () => void;
}

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

const KNOWN_CATEGORIES = new Set(['lighting', 'cooling', 'peripherals', 'monitoring']);

function translateCategory(t: TranslateFn, category: string): string {
  // Any new category emitted by the service without a matching locale string
  // falls back to the raw value so the UI degrades gracefully instead of
  // showing "conflicts.category.foo".
  if (KNOWN_CATEGORIES.has(category)) {
    return t(`conflicts.category.${category}`);
  }
  return category;
}

function ConflictWarningModal({ open, conflicts, onClose, onDismissForever }: ConflictWarningModalProps) {
  const { t } = useTranslation();
  // Track per-id in-flight kill so the End-task button shows a spinner
  // without freezing the whole list while another row is being killed.
  const [killing, setKilling] = useState<string | null>(null);
  const [dismissChecked, setDismissChecked] = useState(false);

  const handleKill = useCallback(async (id: string) => {
    setKilling(id);
    try {
      await killConflict(id);
    } finally {
      setKilling(null);
    }
  }, []);

  const handleDismissToggle = useCallback(() => {
    setDismissChecked(current => {
      const next = !current;
      // Fire the preference write the moment the user ticks the box rather
      // than waiting for them to close the modal — feels snappier and the
      // badge disappears immediately as confirmation.
      if (next) onDismissForever();
      return next;
    });
  }, [onDismissForever]);

  if (!open) return null;

  const hasConflicts = conflicts.length > 0;

  return (
    <DeviceModal
      open={open}
      onClose={onClose}
      title={t('conflicts.modal.title')}
      icon={<AlertTriangle size={18} />}
    >
      <div className={styles.modal}>
        <p className={styles.intro}>{t('conflicts.modal.intro')}</p>

        {hasConflicts ? (
          <ul className={styles.list}>
            {conflicts.map(conflict => (
              <li key={conflict.id} className={styles.row}>
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
                <Button
                  tone="danger"
                  size="sm"
                  loading={killing === conflict.id}
                  onClick={() => handleKill(conflict.id)}
                >
                  {t('conflicts.modal.endTask')}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.empty}>
            <CheckCircle2 size={18} className={styles.emptyIcon} />
            <span>{t('conflicts.modal.empty')}</span>
          </div>
        )}

        <label className={styles.dismissRow}>
          <input
            type="checkbox"
            checked={dismissChecked}
            onChange={handleDismissToggle}
          />
          <span className={styles.dismissText}>
            <ShieldOff size={14} className={styles.dismissIcon} />
            {t('conflicts.modal.dontShowAgain')}
          </span>
        </label>
      </div>
    </DeviceModal>
  );
}
