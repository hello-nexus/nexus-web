import { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useConflictApps } from '../../../hooks/useConflictApps';
import type { PendingControlEnable } from '../../../hooks/useConflictGuardedEnable';
import { useTranslation } from '../../../lib/i18n';
import { Button } from '../Button/Button';
import { ConflictAppCard } from '../ConflictAppCard/ConflictAppCard';
import { DeviceModal } from '../DeviceModal/DeviceModal';
import styles from './NexusControlConflictModal.module.scss';

interface NexusControlConflictModalProps {
  /** The held enable; null renders nothing. */
  pending: PendingControlEnable | null;
  /** Clears the prompt and turns Nexus Control on. */
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Asks to end the app competing for a device before Nexus Control turns on, in the conflict popup's
 * chrome. The card's End task is the yes; the app exiting on its own while this is open also confirms.
 */
export function NexusControlConflictModal({ pending, onConfirm, onCancel }: NexusControlConflictModalProps) {
  const { t } = useTranslation();
  const { conflicts, ready } = useConflictApps(pending !== null);
  const live = pending ? conflicts.find(c => c.id === pending.conflict.id) : undefined;
  // Absence counts as an exit only after this prompt saw the app live: the first frame can predate the scan that found it.
  const seenLiveRef = useRef<PendingControlEnable | null>(null);

  useEffect(() => {
    if (!pending) return;
    if (live) seenLiveRef.current = pending;
    else if (ready && seenLiveRef.current === pending) onConfirm();
  }, [pending, live, ready, onConfirm]);

  if (!pending) return null;

  const vars = { app: pending.conflict.displayName, device: pending.deviceName };
  return (
    <DeviceModal
      open
      onClose={onCancel}
      title={t('devices.conflictEnable.title', vars)}
      icon={<span className={styles.warnIcon}><AlertTriangle size={18} /></span>}
    >
      <div className={styles.modal}>
        <p className={styles.intro}>{t('devices.conflictEnable.intro', vars)}</p>
        {/* Live row, so a respawned app shows its current pid. */}
        <ConflictAppCard conflict={live ?? pending.conflict} onTerminated={onConfirm} />
        <div className={styles.actionRow}>
          <Button tone="neutral" size="sm" onClick={onCancel}>{t('confirm.cancel')}</Button>
        </div>
      </div>
    </DeviceModal>
  );
}
