import { useCallback, useEffect, useRef, useState } from 'react';
import { Fan } from 'lucide-react';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { CollapsibleSection } from '../../common/CollapsibleSection/CollapsibleSection';
import { Button } from '../../common/Button/Button';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import {
  bindLianLiWirelessFan,
  unbindLianLiWirelessFan,
  identifyLianLiWirelessFan,
  type LianLiWirelessFan,
  type LianLiWirelessState,
} from '../../../api/lianli-wireless';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { formatNumber } from '../../../lib/units';
import styles from './LianLiWirelessDevicePage.module.scss';

// Bind/unbind converge on the service in ~2-6s; give up waiting for the
// state poll to confirm it and let the poll speak for itself past this.
const BIND_PENDING_TIMEOUT_MS = 10000;

type BindAction = 'bind' | 'unbind';

/** Fan subtype (fans_type[0]) -> i18n key suffix. */
export function fanTypeKey(fanType: number): 'fanTypeSlv3Lcd' | 'fanTypeSlv3Led' | 'fanTypeTlv2' | 'fanTypeSlInfinity' | 'fanTypeGeneric' {
  if (fanType >= 24 && fanType <= 26) return 'fanTypeSlv3Lcd';
  if (fanType >= 20 && fanType <= 23) return 'fanTypeSlv3Led';
  if (fanType >= 27 && fanType <= 35) return 'fanTypeTlv2';
  if (fanType >= 36 && fanType <= 39) return 'fanTypeSlInfinity';
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
  ReturnType<typeof fanTypeKey> | 'deviceStrimer' | 'deviceWaterBlock' | 'deviceGeneric' {
  if (devType >= 1 && devType <= 9) return 'deviceStrimer';
  if (devType === 10 || devType === 11) return 'deviceWaterBlock';
  if (isFanDevice(devType)) return fanTypeKey(fanType);
  return 'deviceGeneric';
}

export interface LianLiWirelessFansTabProps {
  state: LianLiWirelessState | null;
  refresh: () => Promise<void>;
}

/**
 * Fans tab: connection info + the discovered fan chains with live RPM,
 * bind/unbind and identify controls. The shell owns the state poll; this
 * tab owns the per-fan interaction and pending state.
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
        <div className={styles.row}>
          <span className={styles.rowLabel}>{t('devices.lianli-wireless.masterMac')}</span>
          <span className={styles.rowValueMono}>{state?.masterMac || '-'}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.rowLabel}>{t('devices.lianli-wireless.channel')}</span>
          <span className={styles.rowValueMono}>{loaded ? state.channel : '-'}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.rowLabel}>{t('devices.lianli-wireless.txFirmware')}</span>
          <span className={styles.rowValueMono}>{loaded ? state.txFirmwareVersion : '-'}</span>
        </div>
      </SettingsSection>

      <SettingsSection
        title={t('devices.lianli-wireless.fansSection')}
        boxClassName={styles.sectionBox}
      >
        {loaded && state.fans.length > 0
          ? state.fans.map(fan => (
            <FanChain
              key={fan.mac}
              fan={fan}
              pending={pending[fan.mac]}
              identifying={!!identifying[fan.mac]}
              onBind={handleBind}
              onUnbindRequest={setUnbindTarget}
              onIdentify={handleIdentify}
            />
          ))
          : <p className={styles.emptyNote} data-settings-aside="true">{t('devices.lianli-wireless.noFansPaired')}</p>}
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

function FanChain({
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
  const { numberFormat } = useUnitPrefs();
  const [open, setOpen] = useState(true);
  const typeLabel = t(`devices.lianli-wireless.${deviceTypeKey(fan.devType, fan.fanType)}` as Parameters<typeof t>[0]);
  const isFan = isFanDevice(fan.devType);
  const busy = pending !== undefined || identifying;

  const bindLabel = pending === 'bind'
    ? t('devices.lianli-wireless.binding')
    : t('devices.lianli-wireless.bind');
  const unbindLabel = pending === 'unbind'
    ? t('devices.lianli-wireless.unbinding')
    : t('devices.lianli-wireless.unbind');

  return (
    <CollapsibleSection
      compact
      title={typeLabel}
      open={open}
      onToggle={() => setOpen(o => !o)}
      right={
        <>
          <span className={styles.slotBadge}>{t('devices.lianli-wireless.slot', { n: fan.slot })}</span>
          <span className={fan.boundToUs ? styles.boundBadge : styles.unboundBadge}>
            {t(fan.boundToUs ? 'devices.lianli-wireless.bound' : 'devices.lianli-wireless.unbound')}
          </span>
        </>
      }
    >
      <div className={styles.chainBody}>
        {isFan && fan.rpm.slice(0, fan.fanCount).map((rpm, i) => (
          <div key={i} className={styles.row}>
            <span className={styles.rowLabel}>{t('devices.lianli-wireless.fanN', { n: i + 1 })}</span>
            <span className={styles.rowValue}>
              <Fan size={12} aria-hidden />
              {rpm > 0 ? `${formatNumber(rpm, numberFormat)} RPM` : '-'}
            </span>
          </div>
        ))}
        <div className={styles.actionsRow}>
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
        </div>
      </div>
    </CollapsibleSection>
  );
}
