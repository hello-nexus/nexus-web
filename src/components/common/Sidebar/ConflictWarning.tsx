import { AlertTriangle, ShieldOff } from 'lucide-react';
import type { DetectedConflict } from '../../../api/conflicts';
import { ConflictAllClear } from '../ConflictAllClear/ConflictAllClear';
import { ConflictAppCard } from '../ConflictAppCard/ConflictAppCard';
import { DeviceModal } from '../DeviceModal/DeviceModal';
import { TopBarStatusButton } from '../TopBarStatusButton/TopBarStatusButton';
import { useTranslation } from '../../../lib/i18n';
import { useConflictAutostart } from '../../../hooks/useConflictAutostart';
import { useConflictDevices } from '../../../hooks/useConflictDevices';
import { useConflictRoster } from '../../../hooks/useConflictRoster';
import styles from './ConflictWarning.module.scss';

interface ConflictWarningProps {
  conflicts: readonly DetectedConflict[];
  /** False while the detected-app snapshot is unresolved (service offline); the modal then holds its rows rather than reading the gap as apps exiting. */
  ready: boolean;
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
 * again". Rows are sticky for as long as it stays open: an app that ends stays
 * listed as terminated, and the "all clear" state shows only for a modal
 * opened with nothing detected.
 */
export function ConflictWarningBadge({ conflicts, ready, pulsing, suppressed, open, onOpenChange, onSuppressedChange }: ConflictWarningProps) {
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
        ready={ready}
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
  ready: boolean;
  suppressed: boolean;
  onClose: () => void;
  onSuppressedChange: (suppressed: boolean) => void;
}

export function ConflictWarningModal({
  open, conflicts, ready, suppressed, onClose, onSuppressedChange,
}: ConflictWarningModalProps) {
  const { t } = useTranslation();
  // Rows are sticky for as long as the modal stays open: an app ended from
  // here keeps its place, marked terminated, instead of vanishing mid-read.
  const { entries, conflicts: roster, markTerminated } = useConflictRoster(conflicts, open, ready);
  const { devicesByApp, setOwner } = useConflictDevices(roster, open);
  const { autostartByApp, disable: disableAutostart } = useConflictAutostart(roster, open);

  if (!open) return null;

  const hasConflicts = entries.length > 0;

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
            {entries.map(entry => (
              <li key={entry.conflict.id}>
                <ConflictAppCard
                  conflict={entry.conflict}
                  devices={devicesByApp.get(entry.conflict.id)}
                  onSetOwner={owner => setOwner(entry.conflict.id, owner)}
                  terminated={entry.terminated}
                  onTerminated={() => markTerminated(entry.conflict.id)}
                  autostart={autostartByApp.get(entry.conflict.id)}
                  onDisableAutostart={() => disableAutostart(entry.conflict.id)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <ConflictAllClear />
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
