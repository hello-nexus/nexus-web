import { useCallback, useState } from 'react';
import { AlertTriangle, CheckCircle2, ShieldOff } from 'lucide-react';
import type { DetectedConflict } from '../../../api/conflicts';
import { killConflict } from '../../../api/conflicts';
import { Button } from '../Button/Button';
import { DeviceModal } from '../DeviceModal/DeviceModal';
import { TopBarStatusButton } from '../TopBarStatusButton/TopBarStatusButton';
import { useTranslation } from '../../../lib/i18n';
import styles from './ConflictWarning.module.scss';

interface ConflictWarningProps {
  conflicts: readonly DetectedConflict[];
  /**
   * Persist the "don't show conflict warnings" preference. Called when the
   * user ticks the "Don't show this again" checkbox inside the modal.
   * The parent owns the preference (it lives in NexusSettings.Ui), so the
   * badge stays purely presentational.
   */
  onDismissForever: () => void;
}

/**
 * Top-bar amber button that opens the conflict modal. The button is hidden
 * when there are no conflicts, but the modal stays mounted as long as the
 * user has it open - so it doesn't auto-close mid-read when the watcher clears
 * the last conflict; instead it shows an "all clear" empty state until
 * dismissed.
 */
export function ConflictWarningBadge({ conflicts, onDismissForever }: ConflictWarningProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const count = conflicts.length;

  // No button and no open modal → render nothing.
  if (count === 0 && !open) return null;

  return (
    <>
      {count > 0 && (
        <TopBarStatusButton
          tone="warn"
          icon={<AlertTriangle size={16} />}
          label={t('conflicts.badge.text')}
          onClick={() => setOpen(true)}
        />
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
    </>
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
  // A category with no matching locale string falls back to the raw value
  // instead of showing "conflicts.category.foo".
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
      // Write the preference on tick (not on modal close) so the badge
      // disappears immediately.
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
