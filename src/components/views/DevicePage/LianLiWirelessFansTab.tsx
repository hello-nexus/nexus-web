import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { MonitorSmartphone } from 'lucide-react';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingRow, SettingToggle, type SettingState } from '../../common/SettingRow/SettingRow';
import { Button } from '../../common/Button/Button';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import {
  bindLianLiWirelessFan,
  unbindLianLiWirelessFan,
  identifyLianLiWirelessFan,
  setLianLiWirelessLockBound,
  type LianLiWirelessFan,
  type LianLiFansState,
} from '../../../api/lianli-wireless';
import { useTranslation } from '../../../lib/i18n';
import styles from './LianLiWirelessDevicePage.module.scss';

// Bind/unbind converge on the service in ~2-6s; give up waiting for the
// state poll to confirm it and let the poll speak for itself past this.
const BIND_PENDING_TIMEOUT_MS = 10000;


// A lock change is held until a polled state confirms it; past this the poll speaks for itself.
const LOCK_PENDING_TIMEOUT_MS = 6000;

type BindAction = 'bind' | 'unbind';

/** Fan subtype (fans_type[0]) -> i18n key suffix naming the product line; same ranges as the service's fan families. */
export function fanTypeKey(fanType: number):
  | 'fanTypeSlv3Lcd' | 'fanTypeSlv3Led' | 'fanTypeTlv2' | 'fanTypeTlLcd' | 'fanTypeSlInfinity' | 'fanTypeCl'
  | 'fanTypeRl120' | 'fanTypeSlInfFlex' | 'fanTypeTlFlex' | 'fanTypeSlv4' | 'fanTypeP28v2' | 'fanTypeClv2' | 'fanTypeGeneric' {
  if (fanType >= 24 && fanType <= 26) return 'fanTypeSlv3Lcd';
  if (fanType >= 20 && fanType <= 23) return 'fanTypeSlv3Led';
  if (fanType === 27 || (fanType >= 32 && fanType <= 35)) return 'fanTypeTlLcd';
  if (fanType >= 28 && fanType <= 31) return 'fanTypeTlv2';
  if (fanType >= 36 && fanType <= 39) return 'fanTypeSlInfinity';
  if (fanType === 40) return 'fanTypeRl120';
  if (fanType === 41 || fanType === 42) return 'fanTypeCl';
  if (fanType >= 43 && fanType <= 50) return 'fanTypeSlInfFlex';
  if (fanType >= 51 && fanType <= 58) return 'fanTypeTlFlex';
  if (fanType >= 59 && fanType <= 62) return 'fanTypeSlv4';
  if (fanType === 63) return 'fanTypeP28v2';
  if (fanType === 126 || fanType === 127) return 'fanTypeClv2';
  return 'fanTypeGeneric';
}

/** A device record is a fan chain when dev_type is 0 (the SL-V3 chains report 0,
 *  with the sub-family in fans_type[0]) or a fan's own DevTypes value. Standalone
 *  non-fan devices report their category in dev_type. */
export function isFanDevice(devType: number): boolean {
  return devType === 0 || (devType >= 20 && devType <= 63) || devType === 126 || devType === 127;
}

export function isHydroShiftDevice(devType: number): boolean {
  return devType === 10 || devType === 11;
}

/** A Strimer cable: no fan ports, so no PWM cable either. */
function isStrimerDevice(devType: number): boolean {
  return devType >= 1 && devType <= 9;
}

/** The firmware echoes this duty byte on a port that follows the motherboard PWM header. */
const PWM_FOLLOW_MOTHERBOARD = 6;

/** A populated port of the chain follows the motherboard header, which needs the chain's PWM cable. */
function followsMotherboard(fan: LianLiWirelessFan): boolean {
  return fan.pwm.slice(0, Math.max(fan.fanCount, 1)).some(v => v === PWM_FOLLOW_MOTHERBOARD);
}

/** dev_type (+ fan sub-family) -> i18n key naming the device, so the list says
 *  what each paired device is instead of calling everything a fan. */
export function deviceTypeKey(devType: number, fanType: number):
  ReturnType<typeof fanTypeKey> | 'deviceStrimer' | 'deviceHydroShift' | 'deviceGeneric' {
  if (isStrimerDevice(devType)) return 'deviceStrimer';
  if (isHydroShiftDevice(devType)) return 'deviceHydroShift';
  if (isFanDevice(devType)) return fanTypeKey(fanType);
  return 'deviceGeneric';
}

export interface LianLiWirelessFansTabProps {
  state: LianLiFansState | null;
  refresh: () => Promise<void>;
  /** Wired units: no controller link, bind or lock, only the devices themselves. */
  wired?: boolean;
  /** Flashes one device; the wireless endpoint by default. */
  identify?: (mac: string) => Promise<boolean>;
  /** Opens the panel page of a device that has one, by MAC; undefined when it has none. */
  panelOpener?: (mac: string) => (() => void) | undefined;
}

/**
 * Devices tab: connection info and every paired or discoverable device with
 * bind/unbind/identify. The shell owns the wireless state poll; this tab owns
 * the per-device interaction and pending state.
 */
export function LianLiWirelessFansTab({ state, refresh, panelOpener, wired = false, identify = identifyLianLiWirelessFan }: LianLiWirelessFansTabProps) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<Record<string, BindAction>>({});
  const [identifying, setIdentifying] = useState<Record<string, boolean>>({});
  const [unbindTarget, setUnbindTarget] = useState<string | null>(null);
  const aliveRef = useRef(true);
  const pendingTimeoutsRef = useRef<Record<string, ReturnType<typeof window.setTimeout>>>({});

  const clearPendingTimeout = useCallback((mac: string) => {
    const id = pendingTimeoutsRef.current[mac];
    if (id !== undefined) {
      window.clearTimeout(id);
      delete pendingTimeoutsRef.current[mac];
    }
  }, []);

  const startPending = useCallback((mac: string, action: BindAction) => {
    clearPendingTimeout(mac);
    setPending(prev => ({ ...prev, [mac]: action }));
    pendingTimeoutsRef.current[mac] = window.setTimeout(() => {
      delete pendingTimeoutsRef.current[mac];
      if (!aliveRef.current) return;
      setPending(prev => {
        if (prev[mac] !== action) return prev;
        const next = { ...prev };
        delete next[mac];
        return next;
      });
    }, BIND_PENDING_TIMEOUT_MS);
  }, [clearPendingTimeout]);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      for (const macId of Object.keys(pendingTimeoutsRef.current)) {
        window.clearTimeout(pendingTimeoutsRef.current[macId]);
      }
      pendingTimeoutsRef.current = {};
    };
  }, []);

  // Reconcile pending bind/unbind against the freshly polled state: clear a
  // fan's pending flag once boundToUs reports the action's expected value.
  useEffect(() => {
    if (!state) return;
    setPending(prev => {
      if (Object.keys(prev).length === 0) return prev;
      let changed = false;
      const next = { ...prev };
      for (const fan of state.fans) {
        const action = next[fan.mac];
        if (!action) continue;
        const resolved = (action === 'bind' && fan.boundToUs) || (action === 'unbind' && !fan.boundToUs);
        if (resolved) {
          delete next[fan.mac];
          clearPendingTimeout(fan.mac);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [state, clearPendingTimeout]);

  const loaded = state !== null;
  const lockSupported = !wired && loaded && typeof state.lockBoundDevices === 'boolean';
  const [lockPending, setLockPending] = useState<boolean | null>(null);
  const [lockSaving, setLockSaving] = useState(false);
  const lockTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | undefined>(undefined);
  const lockHintId = useId();
  const lockBound = lockPending ?? (lockSupported && state.lockBoundDevices === true);
  const pairingBlocked = lockBound || lockSaving;

  const clearLockPending = useCallback(() => {
    window.clearTimeout(lockTimeoutRef.current);
    lockTimeoutRef.current = undefined;
    setLockPending(null);
  }, []);

  useEffect(() => {
    if (lockPending !== null && state?.lockBoundDevices === lockPending) clearLockPending();
  }, [state, lockPending, clearLockPending]);

  useEffect(() => () => window.clearTimeout(lockTimeoutRef.current), []);

  useEffect(() => {
    if (pairingBlocked) setUnbindTarget(null);
  }, [pairingBlocked]);

  const failPending = useCallback((mac: string) => {
    clearPendingTimeout(mac);
    if (!aliveRef.current) return;
    setPending(prev => {
      if (!(mac in prev)) return prev;
      const next = { ...prev };
      delete next[mac];
      return next;
    });
  }, [clearPendingTimeout]);

  const runBindAction = useCallback((mac: string, action: BindAction) => {
    startPending(mac, action);
    const call = action === 'bind' ? bindLianLiWirelessFan : unbindLianLiWirelessFan;
    void call(mac).catch(() => false).then(ok => {
      if (!ok) failPending(mac);
      void refresh();
    });
  }, [startPending, failPending, refresh]);

  const handleBind = useCallback((mac: string) => {
    if (pairingBlocked) return;
    runBindAction(mac, 'bind');
  }, [pairingBlocked, runBindAction]);

  const handleUnbindConfirmed = useCallback(() => {
    const mac = unbindTarget;
    setUnbindTarget(null);
    if (!mac || pairingBlocked) return;
    runBindAction(mac, 'unbind');
  }, [unbindTarget, pairingBlocked, runBindAction]);

  const handleIdentify = useCallback((mac: string) => {
    setIdentifying(prev => ({ ...prev, [mac]: true }));
    void identify(mac).finally(() => {
      if (!aliveRef.current) return;
      setIdentifying(prev => {
        if (!prev[mac]) return prev;
        const next = { ...prev };
        delete next[mac];
        return next;
      });
    });
  }, [identify]);

  const onLockChange = useCallback(async (next: boolean) => {
    window.clearTimeout(lockTimeoutRef.current);
    setLockPending(next);
    setLockSaving(true);
    const ok = await setLianLiWirelessLockBound(next).catch(() => false);
    if (!aliveRef.current) return;
    setLockSaving(false);
    if (ok) {
      lockTimeoutRef.current = window.setTimeout(() => {
        lockTimeoutRef.current = undefined;
        setLockPending(null);
      }, LOCK_PENDING_TIMEOUT_MS);
    } else {
      clearLockPending();
    }
    try {
      await refresh();
    } catch {
      // The next poll re-reads the state.
    }
  }, [refresh, clearLockPending]);

  return (
    <>
      {!wired && <SettingsSection
        title={t('devices.lianli-wireless.connectionSection')}
        boxClassName={styles.sectionBox}
      >
        <SettingRow label={t('devices.lianli-wireless.masterMac')}>
          <span className={styles.rowValueMono}>{state?.masterMac || '-'}</span>
        </SettingRow>
        <SettingRow label={t('devices.lianli-wireless.channel')}>
          <span className={styles.rowValueMono}>{loaded ? state.channel : '-'}</span>
        </SettingRow>
        <SettingRow label={t('devices.lianli-wireless.txFirmware')}>
          <span className={styles.rowValueMono}>{loaded ? state.txFirmwareVersion : '-'}</span>
        </SettingRow>
        {(!loaded || lockSupported) && (
          <SettingToggle
            label={t('devices.lianli-wireless.lockBoundDevices')}
            description={<span id={lockHintId}>{t('devices.lianli-wireless.lockBoundDevicesHint')}</span>}
            checked={lockBound}
            mixed={!loaded && lockPending === null}
            onChange={next => { void onLockChange(next); }}
            ariaLabel={t('devices.lianli-wireless.lockBoundDevices')}
            disabled={!loaded || lockSaving || lockPending !== null}
          />
        )}
      </SettingsSection>}

      <SettingsSection
        title={t(wired ? 'devices.lianli-flex.devicesSection' : 'devices.lianli-wireless.devicesSection')}
        boxClassName={styles.sectionBox}
      >
        {loaded && (state.fans.length > 0
          ? state.fans.map(fan => (
            <DeviceRow
              key={fan.mac}
              fan={fan}
              pending={pending[fan.mac]}
              identifying={!!identifying[fan.mac]}
              wired={wired}
              pairingLocked={pairingBlocked}
              lockHintId={lockSupported ? lockHintId : undefined}
              onBind={handleBind}
              onUnbindRequest={setUnbindTarget}
              onIdentify={handleIdentify}
              onOpenPanel={panelOpener?.(fan.mac)}
            />
          ))
          : <p className={styles.emptyNote} data-settings-aside="true">{t('devices.lianli-wireless.noDevicesPaired')}</p>)}
      </SettingsSection>

      <ConfirmModal
        open={unbindTarget != null}
        title={t('devices.lianli-wireless.unbindConfirmTitle')}
        message={t('devices.lianli-wireless.unbindConfirmMessage')}
        confirmLabel={t('devices.lianli-wireless.unbindConfirmLabel')}
        onCancel={() => setUnbindTarget(null)}
        onConfirm={handleUnbindConfirmed}
      />
    </>
  );
}

function DeviceRow({
  fan,
  pending,
  identifying,
  wired,
  pairingLocked,
  lockHintId,
  onBind,
  onUnbindRequest,
  onIdentify,
  onOpenPanel,
}: {
  fan: LianLiWirelessFan;
  pending: BindAction | undefined;
  identifying: boolean;
  wired: boolean;
  pairingLocked: boolean;
  lockHintId: string | undefined;
  onBind: (mac: string) => void;
  onUnbindRequest: (mac: string) => void;
  onIdentify: (mac: string) => void;
  onOpenPanel?: () => void;
}) {
  const { t } = useTranslation();
  const typeLabel = t(`devices.lianli-wireless.${deviceTypeKey(fan.devType, fan.fanType)}` as Parameters<typeof t>[0]);
  const busy = pending !== undefined || identifying;

  const bindLabel = pending === 'bind'
    ? t('devices.lianli-wireless.binding')
    : t('devices.lianli-wireless.bind');
  const unbindLabel = pending === 'unbind'
    ? t('devices.lianli-wireless.unbinding')
    : t('devices.lianli-wireless.unbind');
  const bindState: SettingState | undefined = wired
    ? (fan.receiverBound ? { label: t('devices.lianli-flex.boundElsewhere'), tone: 'warn' } : undefined)
    : fan.boundToUs
    ? { label: `${t('devices.lianli-wireless.bound')} - ${t('devices.lianli-wireless.slot', { n: fan.slot })}`, tone: 'accent' }
    : { label: t('devices.lianli-wireless.unbound') };
  const details = [
    fan.firmwareVersion ? t('devices.lianli-wireless.firmwareVersion', { v: fan.firmwareVersion }) : null,
    wired && fan.lcdFirmware ? t('devices.lianli-flex.lcdFirmware', { v: fan.lcdFirmware }) : null,
    fan.boundToUs && !isStrimerDevice(fan.devType) && fan.pwmCableConnected === false && followsMotherboard(fan) ? t('devices.lianli-wireless.noPwmCable') : null,
  ].filter(Boolean).join(' - ');

  return (
    <SettingRow
      label={typeLabel}
      description={details || undefined}
      state={bindState}
      labelSuffix={onOpenPanel && (
        <Button size="sm" tone="neutral" icon={<MonitorSmartphone size={14} />} onClick={onOpenPanel}>
          {t('devices.lianli-wireless.managePanel')}
        </Button>
      )}
    >
      {wired ? null : fan.boundToUs ? (
        <Button size="sm" tone="danger" disabled={busy || pairingLocked} aria-describedby={pairingLocked ? lockHintId : undefined} onClick={() => onUnbindRequest(fan.mac)}>
          {unbindLabel}
        </Button>
      ) : (
        <Button size="sm" tone="accent" disabled={busy || pairingLocked} aria-describedby={pairingLocked ? lockHintId : undefined} onClick={() => onBind(fan.mac)}>
          {bindLabel}
        </Button>
      )}
      <Button size="sm" tone="neutral" disabled={busy} onClick={() => onIdentify(fan.mac)}>
        {t('devices.lianli-wireless.identify')}
      </Button>
    </SettingRow>
  );
}
