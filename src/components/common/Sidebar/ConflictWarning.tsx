import { AlertTriangle, CheckCircle2, ShieldOff } from 'lucide-react';
import type { ConflictAutostartEntry, DetectedConflict } from '../../../api/conflicts';
import { ConflictAppCard } from '../ConflictAppCard/ConflictAppCard';
import { DeviceModal } from '../DeviceModal/DeviceModal';
import { TopBarStatusButton } from '../TopBarStatusButton/TopBarStatusButton';
import { useConflictAutostart } from '../../../hooks/useConflictAutostart';
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
  const autostartById = useConflictAutostart(open);
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
        autostartById={autostartById}
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
  /** Resolved autostart entries per conflict id; an id absent here gets no startup control. */
  autostartById?: Readonly<Record<string, ConflictAutostartEntry[]>>;
}

export function ConflictWarningModal({
  open, conflicts, suppressed, onClose, onSuppressedChange, autostartById,
}: ConflictWarningModalProps) {
  const { t } = useTranslation();

  if (!open) return null;

  const hasConflicts = conflicts.length > 0;

  return (
    <DeviceModal
      open={open}
      onClose={onClose}
      title={t('conflicts.modal.title')}
      // DeviceModal tints its icon slot with --accent; conflicts are a warning
      // everywhere else they appear (the badge, the onboarding screen).
      icon={<span className={styles.warnIcon}><AlertTriangle size={18} /></span>}
    >
      <div className={styles.modal}>
        <p className={styles.intro}>{t('conflicts.modal.intro')}</p>

        {hasConflicts ? (
          <ul className={styles.list}>
            {conflicts.map(conflict => (
              <li key={conflict.id}>
                <ConflictAppCard conflict={conflict} autostart={autostartById?.[conflict.id]} />
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
