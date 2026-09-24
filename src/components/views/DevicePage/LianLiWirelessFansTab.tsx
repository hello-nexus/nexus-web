import { useCallback, useEffect, useRef, useState } from 'react';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingRow, type SettingState } from '../../common/SettingRow/SettingRow';
import { Badge } from '../../common/Badge/Badge';
import { Button } from '../../common/Button/Button';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import {
  bindLianLiWirelessFan,
  unbindLianLiWirelessFan,
  identifyLianLiWirelessFan,
  type LianLiWirelessFan,
  type LianLiWirelessState,
} from '../../../api/lianli-wireless';
import { useTranslation } from '../../../lib/i18n';
import styles from './LianLiWirelessDevicePage.module.scss';

// Bind/unbind converge on the service in ~2-6s; give up waiting for the
// state poll to confirm it and let the poll speak for itself past this.
const BIND_PENDING_TIMEOUT_MS = 10000;


type BindAction = 'bind' | 'unbind';

/** Fan subtype (fans_type[0]) -> i18n key suffix naming the product line; same ranges as the service's fan families. */
export function fanTypeKey(fanType: number):
  'fanTypeSlv3Lcd' | 'fanTypeSlv3Led' | 'fanTypeTlv2' | 'fanTypeTlLcd' | 'fanTypeSlInfinity' | 'fanTypeCl' | 'fanTypeGeneric' {
  if (fanType >= 24 && fanType <= 26) return 'fanTypeSlv3Lcd';
  if (fanType >= 20 && fanType <= 23) return 'fanTypeSlv3Led';
  if (fanType === 27 || (fanType >= 32 && fanType <= 35)) return 'fanTypeTlLcd';
  if (fanType >= 28 && fanType <= 31) return 'fanTypeTlv2';
  if (fanType >= 36 && fanType <= 39) return 'fanTypeSlInfinity';
  if (fanType >= 40 && fanType <= 42) return 'fanTypeCl';
  return 'fanTypeGeneric';
}

/** A device record is a fan chain when dev_type is 0 (the SL-V3 chains report 0,
 *  with the sub-family in fans_type[0]) or a fan's own DevTypes value. Standalone
 *  non-fan devices report their category in dev_type. */
export function isFanDevice(devType: number): boolean {
  return devType === 0 || (devType >= 20 && devType <= 42);
}

/** dev_type (+ fan sub-family) -> i18n key naming the device, so the list says
 *  what each paired device is instead of calling everything a fan. */
export function deviceTypeKey(devType: number, fanType: number):
  ReturnType<typeof fanTypeKey> | 'deviceStrimer' | 'deviceHydroShift' | 'deviceGeneric' {
  if (devType >= 1 && devType <= 9) return 'deviceStrimer';
  if (devType === 10 || devType === 11) return 'deviceHydroShift';
  if (isFanDevice(devType)) return fanTypeKey(fanType);
  return 'deviceGeneric';
}

export interface LianLiWirelessFansTabProps {
  state: LianLiWirelessState | null;
  refresh: () => Promise<void>;
}

/**
 * Devices tab: connection info and every paired or discoverable device with
 * bind/unbind/identify. The shell owns the wireless state poll; this tab owns
 * the per-device interaction and pending state.
 */
export function LianLiWirelessFansTab({ state, refresh }: LianLiWirelessFansTabProps) {
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

  const handleBind = useCallback((mac: string) => {
    startPending(mac, 'bind');
    void bindLianLiWirelessFan(mac).then(() => { void refresh(); });
  }, [startPending, refresh]);

  const handleUnbindConfirmed = useCallback(() => {
    const mac = unbindTarget;
    setUnbindTarget(null);
    if (!mac) return;
    startPending(mac, 'unbind');
    void unbindLianLiWirelessFan(mac).then(() => { void refresh(); });
  }, [unbindTarget, startPending, refresh]);

  const handleIdentify = useCallback((mac: string) => {
    setIdentifying(prev => ({ ...prev, [mac]: true }));
    void identifyLianLiWirelessFan(mac).finally(() => {
      if (!aliveRef.current) return;
      setIdentifying(prev => {
        if (!prev[mac]) return prev;
        const next = { ...prev };
        delete next[mac];
        return next;
      });
    });
  }, []);

  const loaded = state !== null;

  return (
    <>
      <SettingsSection
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
      </SettingsSection>

      <SettingsSection
        title={t('devices.lianli-wireless.devicesSection')}
        boxClassName={styles.sectionBox}
      >
        {loaded && state.fans.length > 0
          ? state.fans.map(fan => (
            <DeviceRow
              key={fan.mac}
              fan={fan}
              pending={pending[fan.mac]}
              identifying={!!identifying[fan.mac]}
              onBind={handleBind}
              onUnbindRequest={setUnbindTarget}
              onIdentify={handleIdentify}
            />
          ))
          : <p className={styles.emptyNote} data-settings-aside="true">{t('devices.lianli-wireless.noDevicesPaired')}</p>}
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
  onBind,
  onUnbindRequest,
  onIdentify,
}: {
  fan: LianLiWirelessFan;
  pending: BindAction | undefined;
  identifying: boolean;
  onBind: (mac: string) => void;
  onUnbindRequest: (mac: string) => void;
  onIdentify: (mac: string) => void;
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
  const bindState: SettingState = fan.boundToUs
    ? { label: t('devices.lianli-wireless.bound'), tone: 'accent' }
    : { label: t('devices.lianli-wireless.unbound') };

  return (
    <SettingRow
      label={typeLabel}
      state={bindState}
    >
      {fan.boundToUs && <Badge label={t('devices.lianli-wireless.slot', { n: fan.slot })} color="var(--text-dim)" />}
      {fan.boundToUs ? (
        <Button size="sm" tone="danger" disabled={busy} onClick={() => onUnbindRequest(fan.mac)}>
          {unbindLabel}
        </Button>
      ) : (
        <Button size="sm" tone="accent" disabled={busy} onClick={() => onBind(fan.mac)}>
          {bindLabel}
        </Button>
      )}
      <Button size="sm" tone="neutral" disabled={busy} onClick={() => onIdentify(fan.mac)}>
        {t('devices.lianli-wireless.identify')}
      </Button>
    </SettingRow>
  );
}
