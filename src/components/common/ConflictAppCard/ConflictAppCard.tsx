import { useCallback, useEffect, useRef, useState } from 'react';
import { PowerOff } from 'lucide-react';
import type { ConflictAutostartEntry, DetectedConflict } from '../../../api/conflicts';
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
  /** Flips every listed device to the chosen owner, and the app's whitelist state. Required for the switch to render. */
  onSetOwner?: (owner: ConflictOwnerChoice) => Promise<boolean>;
  /** Whether the app is on `Ui.ConflictAutoKillExclusions` - the switch position this reflects, independent of device ownership. */
  whitelisted?: boolean;
  /** The app has been ended: the row stays listed with its devices, minus the owner switch. */
  terminated?: boolean;
  /** Reports a kill from the End task button that stuck. */
  onTerminated?: () => void;
  /**
   * What still launches this app at boot. Undefined means the service has no
   * verified way to stop this app starting with Windows, and the action is
   * not offered at all; an empty array means nothing starts it any more.
   */
  autostart?: readonly ConflictAutostartEntry[];
  /** Turns off everything in `autostart`. Required for the action to render; resolves false when any entry survived. */
  onDisableAutostart?: () => Promise<boolean>;
  /** The surface verified this app's boot entries off (a resolve-all); shows the confirmation the card's own click would. */
  autostartDisabled?: boolean;
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
 * all-or-none switch over who drives it, driven by `whitelisted` rather than
 * the devices' own agreement: choosing the app whitelists it (never ended,
 * never alerted on) and hands the devices back; choosing Nexus clears the
 * whitelist and claims the devices, without ending the app.
 */
export function ConflictAppCard({
  conflict, devices, onSetOwner, whitelisted, terminated, onTerminated, autostart, onDisableAutostart, autostartDisabled,
}: ConflictAppCardProps) {
  const { t } = useTranslation();
  // Which owner is being applied, or null when idle.
  const [applying, setApplying] = useState<ConflictOwnerChoice | null>(null);
  // Shown immediately on click; cleared once `whitelisted` reflects the write,
  // or at once when the write failed, so the switch never shows an owner the
  // service did not record.
  const [optimisticOwner, setOptimisticOwner] = useState<ConflictOwnerChoice | null>(null);
  const [disablingAutostart, setDisablingAutostart] = useState(false);
  // Sticky for the life of the card: the entry list goes empty on success (or
  // the app drops out of the read once it has ended), so without this the
  // confirmation would vanish in the same frame it appeared.
  const [ownAutostartDisabled, setOwnAutostartDisabled] = useState(false);
  const [autostartFailed, setAutostartFailed] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    setOptimisticOwner(null);
  }, [whitelisted]);

  const list = devices ?? [];
  const showDevices = list.length > 0 && onSetOwner !== undefined;
  // An ended app drives nothing, so the choice is moot; the devices stay
  // listed so the row still says what it was fighting Nexus for.
  const showSwitch = showDevices && terminated !== true;
  const currentOwner: ConflictOwnerChoice = whitelisted ? APP_OWNER : NEXUS_OWNER;
  const selection = optimisticOwner ?? currentOwner;

  const handleOwner = useCallback(async (key: string) => {
    if (!onSetOwner || applying !== null) return;
    const owner: ConflictOwnerChoice = key === NEXUS_OWNER ? NEXUS_OWNER : APP_OWNER;
    if (owner === selection) return;
    setApplying(owner);
    setOptimisticOwner(owner);
    try {
      const recorded = await onSetOwner(owner);
      if (!recorded && mountedRef.current) setOptimisticOwner(null);
    } finally {
      if (mountedRef.current) setApplying(null);
    }
  }, [applying, onSetOwner, selection]);

  const handleDisableAutostart = useCallback(async () => {
    if (!onDisableAutostart || disablingAutostart) return;
    setDisablingAutostart(true);
    setAutostartFailed(false);
    try {
      const ok = await onDisableAutostart();
      if (!mountedRef.current) return;
      if (ok) setOwnAutostartDisabled(true);
      else setAutostartFailed(true);
    } finally {
      if (mountedRef.current) setDisablingAutostart(false);
    }
  }, [disablingAutostart, onDisableAutostart]);

  // Offered only for an app the service has a verified recipe for, and only
  // while something is still starting it. Ending the task does not stop the
  // next boot, so a terminated row keeps the action.
  const showAutostart = autostart !== undefined && onDisableAutostart !== undefined && autostart.length > 0;
  const showAutostartDisabled = !showAutostart && (ownAutostartDisabled || autostartDisabled === true);

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
          {showAutostartDisabled && (
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
