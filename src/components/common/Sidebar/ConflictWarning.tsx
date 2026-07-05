import { useCallback, useEffect, useState } from 'react';
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
  /** Pulse the badge to flag a conflicting app that just started running. */
  pulsing: boolean;
  /** Whether conflict alerts are currently suppressed (the persisted setting). */
  suppressed: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Persist the "don't show conflict warnings" preference. Driven by the
   * in-modal checkbox, which mirrors `suppressed` and toggles both ways.
   * The parent owns the preference (it lives in NexusSettings.Ui), so the
   * badge stays purely presentational.
   */
  onSuppressedChange: (suppressed: boolean) => void;
}

/**
 * Top-bar amber button that opens the conflict modal. The button is hidden
 * when there are no conflicts (or alerts are suppressed), but the modal stays
 * mounted as long as the user has it open - so it doesn't auto-close mid-read
 * when the watcher clears the last conflict or the user ticks "don't show
 * again"; instead it shows an "all clear" empty state until dismissed.
 */
export function ConflictWarningBadge({ conflicts, pulsing, suppressed, open, onOpenChange, onSuppressedChange }: ConflictWarningProps) {
  const { t } = useTranslation();
  const count = conflicts.length;
  const showButton = count > 0 && !suppressed;

  // No button and no open modal → render nothing.
  if (!showButton && !open) return null;

  return (
    <>
      {showButton && (
        <TopBarStatusButton
          tone="warn"
          pulsing={pulsing}
          icon={<AlertTriangle size={16} />}
          label={t('conflicts.badge.text')}
          onClick={() => onOpenChange(true)}
        />
      )}
      <ConflictWarningModal
        open={open}
        conflicts={conflicts}
        suppressed={suppressed}
        onClose={() => onOpenChange(false)}
        onSuppressedChange={onSuppressedChange}
      />
    </>
  );
}

interface ConflictWarningModalProps {
  open: boolean;
  conflicts: readonly DetectedConflict[];
  suppressed: boolean;
  onClose: () => void;
  onSuppressedChange: (suppressed: boolean) => void;
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

function ConflictWarningModal({ open, conflicts, suppressed, onClose, onSuppressedChange }: ConflictWarningModalProps) {
  const { t } = useTranslation();
  // Ids with a kill in flight (or killed but not yet dropped from the list).
  // The watcher only rebroadcasts the conflict set on its periodic poll, so a
  // killed row lingers until the next one; keep the spinner up across that gap
  // rather than clearing it when the kill POST returns. A set so ending one app
  // does not reset another row's spinner.
  const [killing, setKilling] = useState<ReadonlySet<string>>(() => new Set());

  // Drop ids the watcher has cleared so a relaunched app gets a fresh button.
  useEffect(() => {
    setKilling(prev => {
      if (prev.size === 0) return prev;
      const next = new Set([...prev].filter(id => conflicts.some(c => c.id === id)));
      return next.size === prev.size ? prev : next;
    });
  }, [conflicts]);

  const handleKill = useCallback(async (id: string) => {
    setKilling(prev => new Set(prev).add(id));
    let killed = false;
    try {
      const res = await killConflict(id);
      killed = res?.killed ?? false;
    } catch {
      killed = false;
    }
    // Keep the spinner until the watcher drops the row (the prune effect clears
    // the id); on failure re-enable the button so the user can retry.
    if (!killed) {
      setKilling(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, []);

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
                  loading={killing.has(conflict.id)}
                  loadingHidesLabel
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
            checked={suppressed}
            onChange={() => onSuppressedChange(!suppressed)}
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
