import { useMemo } from 'react';
import { AlertTriangle, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import type { DetectedConflict } from '../../../api/conflicts';
import { Button } from '../Button/Button';
import { ConflictAllClear } from '../ConflictAllClear/ConflictAllClear';
import { ConflictAppCard } from '../ConflictAppCard/ConflictAppCard';
import { DeviceModal } from '../DeviceModal/DeviceModal';
import { TopBarStatusButton } from '../TopBarStatusButton/TopBarStatusButton';
import { useTranslation } from '../../../lib/i18n';
import { useConflictAutostart } from '../../../hooks/useConflictAutostart';
import { useConflictAutoKillExclusions } from '../../../hooks/useUiSettings';
import { useConflictDevices } from '../../../hooks/useConflictDevices';
import { useConflictResolveAll } from '../../../hooks/useConflictResolveAll';
import { useConflictRoster } from '../../../hooks/useConflictRoster';
import styles from './ConflictWarning.module.scss';

interface ConflictWarningProps {
  conflicts: readonly DetectedConflict[];
  /** False while the detected-app snapshot is unresolved (service offline); the modal then holds its rows rather than reading the gap as apps exiting. */
  ready: boolean;
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
  /** Open Settings' Manage conflicting applications modal. */
  onManageApps: () => void;
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
export function ConflictWarningBadge({ conflicts, ready, suppressed, open, onOpenChange, onSuppressedChange, onManageApps }: ConflictWarningProps) {
  const { t } = useTranslation();
  const exclusions = useConflictAutoKillExclusions();
  const whitelisted = useMemo(() => new Set(exclusions), [exclusions]);
  // A whitelisted app never alerts: the button reflects only what the user
  // has not already told Nexus to leave alone.
  const showButton = conflicts.some(c => !whitelisted.has(c.id)) && !suppressed;

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
        suppressed={suppressed}
        whitelisted={whitelisted}
        onClose={() => onOpenChange(false)}
        onSuppressedChange={onSuppressedChange}
        onManageApps={() => { onOpenChange(false); onManageApps(); }}
      />
    </>
  );
}

interface ConflictWarningModalProps {
  open: boolean;
  conflicts: readonly DetectedConflict[];
  ready: boolean;
  suppressed: boolean;
  whitelisted: ReadonlySet<string>;
  onClose: () => void;
  onSuppressedChange: (suppressed: boolean) => void;
  onManageApps: () => void;
}

export function ConflictWarningModal({
  open, conflicts, ready, suppressed, whitelisted, onClose, onSuppressedChange, onManageApps,
}: ConflictWarningModalProps) {
  const { t } = useTranslation();
  // Rows are sticky for as long as the modal stays open: an app ended from
  // here keeps its place, marked terminated, instead of vanishing mid-read.
  const { entries, conflicts: roster, markTerminated } = useConflictRoster(conflicts, open, ready);
  const { devicesByApp, setOwner } = useConflictDevices(roster, open);
  const { autostartByApp, disable: disableAutostart } = useConflictAutostart(roster, open);
  const { pending, resolving, autostartDisabledIds, resolveAll } =
    useConflictResolveAll(entries, markTerminated, autostartByApp, disableAutostart, whitelisted);

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
                  whitelisted={whitelisted.has(entry.conflict.id)}
                  terminated={entry.terminated}
                  onTerminated={() => markTerminated(entry.conflict.id)}
                  autostart={autostartByApp.get(entry.conflict.id)}
                  onDisableAutostart={() => disableAutostart(entry.conflict.id)}
                  autostartDisabled={autostartDisabledIds.has(entry.conflict.id)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <ConflictAllClear />
        )}

        <div className={styles.actionRow}>
          <Button tone="neutral" size="sm" icon={<SlidersHorizontal />} onClick={onManageApps}>
            {t('conflicts.modal.manageApps')}
          </Button>
          {hasConflicts && (
            <Button
              tone="accent"
              size="sm"
              icon={<ShieldCheck />}
              loading={resolving}
              loadingHidesLabel
              disabled={!pending}
              onClick={() => { void resolveAll(); }}
            >
              {t('conflicts.modal.resolveAll')}
            </Button>
          )}
        </div>

        <label className={styles.dismissRow}>
          <input
            type="checkbox"
            checked={suppressed}
            onChange={() => onSuppressedChange(!suppressed)}
          />
          <span>{t('conflicts.modal.dontShowAgain')}</span>
        </label>
      </div>
    </DeviceModal>
  );
}
