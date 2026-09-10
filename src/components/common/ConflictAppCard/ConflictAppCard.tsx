import { useCallback, useEffect, useRef, useState } from 'react';
import { PowerOff } from 'lucide-react';
import { killConflict, type ConflictAutostartEntry, type DetectedConflict } from '../../../api/conflicts';
import type { ConflictDevice } from '../../../hooks/useConflictDevices';
import { Button } from '../Button/Button';
import { ChipGroup } from '../ChipGroup/ChipGroup';
import { EndTaskButton } from '../EndTaskButton/EndTaskButton';
import { useTranslation } from '../../../lib/i18n';
import styles from './ConflictAppCard.module.scss';

export type ConflictOwnerChoice = 'nexus' | 'app';

const NEXUS_OWNER: ConflictOwnerChoice = 'nexus';
const APP_OWNER: ConflictOwnerChoice = 'app';
const AUTOSTART_ICON_SIZE = 14;

interface ConflictAppCardProps {
  conflict: DetectedConflict;
  /** Devices Nexus recognizes that this app also drives. Absent or empty renders the plain row. */
  devices?: readonly ConflictDevice[];
  /** Flips every listed device to the chosen owner. Required for the switch to render. */
  onSetOwner?: (owner: ConflictOwnerChoice) => Promise<void>;
  /** The app has been ended: the row stays listed with its devices, minus the owner switch. */
  terminated?: boolean;
  /** Reports a kill that stuck, from either the button or the owner switch. */
  onTerminated?: () => void;
  /**
   * What still launches this app at boot. Undefined means the service has no
   * verified way to stop this app starting with Windows, and the action is
   * not offered at all; an empty array means nothing starts it any more.
   */
  autostart?: readonly ConflictAutostartEntry[];
  /** Turns off everything in `autostart`. Required for the action to render; resolves false when any entry survived. */
  onDisableAutostart?: () => Promise<boolean>;
}

/** The switch position the device list already agrees on; '' when the devices are split. */
export function selectedOwner(devices: readonly ConflictDevice[]): ConflictOwnerChoice | '' {
  if (devices.length === 0) return '';
  if (devices.every(d => d.owner === 'nexus')) return 'nexus';
  if (devices.every(d => d.owner === 'app')) return 'app';
  return '';
}

/**
 * Name + executable/PID meta row for a single detected conflicting app, with
 * an End Task action. Used by ConflictWarningModal (one per detected conflict),
 * ConflictOnboardingScreen, and the device-page NexusControlOff gate (the
 * single conflict blocking that device).
 *
 * With `devices`, the card also lists the hardware both apps are after and an
 * all-or-none switch over who drives it. Handing the lot to Nexus ends the app
 * as well, so it cannot keep fighting for handles Nexus is about to claim;
 * handing it to the app leaves the app running.
 */
export function ConflictAppCard({
  conflict, devices, onSetOwner, terminated, onTerminated, autostart, onDisableAutostart,
}: ConflictAppCardProps) {
  const { t } = useTranslation();
  // Which owner is being applied, or null when idle. Held as the choice rather
  // than a flag because only the Nexus path ends the app, and End task must
  // spin for that one alone.
  const [applying, setApplying] = useState<ConflictOwnerChoice | null>(null);
  // Set when handing over to Nexus did not end the app: the devices are now
  // Nexus-controlled but the app is still up, so the row stays and says so.
  const [endFailed, setEndFailed] = useState(false);
  const [disablingAutostart, setDisablingAutostart] = useState(false);
  // Sticky for the life of the card: the entry list goes empty on success, so
  // without this the confirmation would vanish in the same frame it appeared.
  const [autostartDisabled, setAutostartDisabled] = useState(false);
  const [autostartFailed, setAutostartFailed] = useState(false);
  // The kill clears this row through the watcher, so the card can unmount
  // mid-await; only a still-mounted card resets its busy state.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // A row that un-terminates (the app returned under a new pid) must not
  // resurface the previous attempt's failure alongside a live switch.
  useEffect(() => {
    if (terminated) setEndFailed(false);
  }, [terminated]);

  const list = devices ?? [];
  const selection = selectedOwner(list);
  const showDevices = list.length > 0 && onSetOwner !== undefined;
  // An ended app drives nothing, so the choice is moot; the devices stay
  // listed so the row still says what it was fighting Nexus for.
  const showSwitch = showDevices && terminated !== true;

  const handleOwner = useCallback(async (key: string) => {
    if (!onSetOwner || applying !== null) return;
    const owner: ConflictOwnerChoice = key === NEXUS_OWNER ? NEXUS_OWNER : APP_OWNER;
    if (owner === selection) return;
    setApplying(owner);
    setEndFailed(false);
    try {
      await onSetOwner(owner);
      if (owner === NEXUS_OWNER) {
        const res = await killConflict(conflict.id).catch(() => null);
        if (!mountedRef.current) return;
        if (res?.killed) onTerminated?.();
        else setEndFailed(true);
      }
    } finally {
      if (mountedRef.current) setApplying(null);
    }
  }, [applying, conflict.id, onSetOwner, onTerminated, selection]);

  const handleDisableAutostart = useCallback(async () => {
    if (!onDisableAutostart || disablingAutostart) return;
    setDisablingAutostart(true);
    setAutostartFailed(false);
    try {
      const ok = await onDisableAutostart();
      if (!mountedRef.current) return;
      if (ok) setAutostartDisabled(true);
      else setAutostartFailed(true);
    } finally {
      if (mountedRef.current) setDisablingAutostart(false);
    }
  }, [disablingAutostart, onDisableAutostart]);

  // Offered only for an app the service has a verified recipe for, and only
  // while something is still starting it. Ending the task does not stop the
  // next boot, so a terminated row keeps the action.
  const showAutostart = autostart !== undefined && onDisableAutostart !== undefined && autostart.length > 0;

  // What each entry is, in the user's terms. The button acts on a Windows
  // startup entry, not on the vendor app's own switch, and saying so is the
  // difference between an honest label and a claim about the app.
  const entryLabel = (entry: ConflictAutostartEntry): string => {
    if (entry.kind === 'service') return t('conflicts.modal.autostartTargetService', { name: entry.entryName });
    if (entry.kind === 'scheduledTask') return t('conflicts.modal.autostartTargetTask', { name: entry.entryName });
    return t('conflicts.modal.autostartTargetStartup', { name: entry.entryName });
  };

  const ownerLabel = (device: ConflictDevice): string => {
    if (device.owner === 'nexus') return t('brand');
    if (device.owner === 'app') return conflict.displayName;
    return t('conflicts.devices.mixed');
  };

  return (
    <div className={styles.row}>
      <div className={styles.rowHead}>
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
          <EndTaskButton
            conflictId={conflict.id}
            pid={conflict.pid}
            busy={applying === NEXUS_OWNER}
            terminated={terminated}
            onKilled={onTerminated}
          />
          {showAutostart && (
            <Button
              tone="neutral"
              size="sm"
              loading={disablingAutostart}
              loadingHidesLabel
              onClick={() => { void handleDisableAutostart(); }}
            >
              {t('conflicts.modal.disableAutostart')}
            </Button>
          )}
          {!showAutostart && autostartDisabled && (
            <span className={styles.autostartOff} role="status">
              <PowerOff size={AUTOSTART_ICON_SIZE} aria-hidden />
              {t('conflicts.modal.autostartDisabled')}
            </span>
          )}
        </div>
      </div>

      {showAutostart && (
        <ul className={styles.autostartTargets}>
          {autostart!.map(entry => (
            <li key={`${entry.kind}:${entry.entryName}`}>{entryLabel(entry)}</li>
          ))}
        </ul>
      )}

      {autostartFailed && (
        <p className={styles.autostartFailed} role="alert">
          {t('conflicts.modal.autostartFailed', { app: conflict.displayName })}
        </p>
      )}

      {showDevices && (
        <div className={styles.devices}>
          <div className={styles.devicesHeading}>{t('conflicts.devices.heading')}</div>
          <ul className={styles.deviceList}>
            {list.map(device => (
              <li key={device.key} className={styles.deviceRow}>
                <span className={styles.deviceName}>{device.name}</span>
                <span className={styles.deviceOwner} data-owner={device.owner}>{ownerLabel(device)}</span>
              </li>
            ))}
          </ul>
          {endFailed && !terminated && (
            <p className={styles.endFailed} role="alert">
              {t('conflicts.devices.endFailed', { app: conflict.displayName })}
            </p>
          )}
          {showSwitch && (
            <ChipGroup
              fullWidth
              ariaLabel={t('conflicts.devices.switchLabel')}
              activeKey={selection}
              onChange={key => { void handleOwner(key); }}
              options={[
                { key: NEXUS_OWNER, label: t('conflicts.devices.nexusControls'), disabled: applying !== null },
                { key: APP_OWNER, label: t('conflicts.devices.appControls', { app: conflict.displayName }), disabled: applying !== null },
              ]}
            />
          )}
        </div>
      )}
    </div>
  );
}
