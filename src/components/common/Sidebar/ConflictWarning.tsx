import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { HYTE_NEXUS2_CONFLICT_ID, type DetectedConflict } from '../../../api/conflicts';
import { ConflictOutcomePanel } from '../ConflictOutcomePanel/ConflictOutcomePanel';
import { DeviceModal } from '../DeviceModal/DeviceModal';
import { TopBarStatusButton } from '../TopBarStatusButton/TopBarStatusButton';
import { useTranslation } from '../../../lib/i18n';
import { useConflictAutoKillExclusions } from '../../../hooks/useUiSettings';
import { alwaysAlerts, useConflictOverlap } from '../../../hooks/useConflictOverlap';
import styles from './ConflictWarning.module.scss';

interface ConflictWarningProps {
  conflicts: readonly DetectedConflict[];
  /** False while the detected-app snapshot is unresolved (service offline); the modal then holds its rows rather than reading the gap as apps exiting. */
  ready: boolean;
  /** Whether conflict alerts are currently suppressed (the persisted setting). */
  suppressed: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Top-bar amber button that opens the conflict modal. The button is hidden
 * when there are no conflicts that share a device with Nexus (or alerts are suppressed), but the modal stays
 * mounted as long as the user has it open - so it doesn't auto-close mid-read
 * when the watcher clears the last conflict or the user ticks "don't show
 * again". Rows are sticky for as long as it stays open: an app that ends stays
 * listed as terminated, and the "all clear" state shows only for a modal
 * opened with nothing detected.
 */
export function ConflictWarningBadge({ conflicts, ready, suppressed, open, onOpenChange }: ConflictWarningProps) {
  const { t } = useTranslation();
  const exclusions = useConflictAutoKillExclusions();
  // Nexus 2 is never whitelisted: the service ends it whatever the list says.
  const whitelisted = useMemo(
    () => new Set(exclusions.filter(id => id !== HYTE_NEXUS2_CONFLICT_ID)),
    [exclusions],
  );
  const overlapsControlledDevice = useConflictOverlap(
    !suppressed && conflicts.some(c => !whitelisted.has(c.id) && !alwaysAlerts(c)),
  );
  // A whitelisted app never alerts, nor does one that shares no device with
  // what Nexus controls: the button reflects only real contention.
  const showButton = conflicts.some(c => !whitelisted.has(c.id) && overlapsControlledDevice(c)) && !suppressed;

  // No button and no open modal → render nothing.
  if (!showButton && !open) return null;

  return (
    <>
      {showButton && (
        <TopBarStatusButton
          tone="warn"
          pulsing
          icon={<AlertTriangle size={16} />}
          label={t('conflicts.badge.text')}
          onClick={() => onOpenChange(true)}
        />
      )}
      <ConflictWarningModal
        open={open}
        conflicts={conflicts}
        ready={ready}
        whitelisted={whitelisted}
        onClose={() => onOpenChange(false)}
      />
    </>
  );
}

interface ConflictWarningModalProps {
  open: boolean;
  conflicts: readonly DetectedConflict[];
  ready: boolean;
  whitelisted: ReadonlySet<string>;
  onClose: () => void;
}

export function ConflictWarningModal({
  open, conflicts, ready, whitelisted, onClose,
}: ConflictWarningModalProps) {
  const { t } = useTranslation();

  if (!open) return null;

  return (
    <DeviceModal
      open={open}
      onClose={onClose}
      title={t('conflicts.modal.title')}
      large
      // DeviceModal tints its icon slot with --accent; conflicts are a warning
      // everywhere else they appear (the badge, the onboarding screen).
      icon={<span className={styles.warnIcon}><AlertTriangle size={18} /></span>}
    >
      <div className={styles.modal}>
        <ConflictOutcomePanel
          conflicts={conflicts}
          ready={ready}
          active={open}
          whitelisted={whitelisted}
          variant="modal"
          heading={<p className={styles.intro}>{t('conflicts.modal.intro')}</p>}
          onDone={onClose}
        />
      </div>
    </DeviceModal>
  );
}
