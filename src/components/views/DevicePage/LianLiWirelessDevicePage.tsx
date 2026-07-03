import { useCallback, useEffect, useRef, useState } from 'react';
import { Fan } from 'lucide-react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { Placeholder } from '../Placeholder';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { CollapsibleSection } from '../../common/CollapsibleSection/CollapsibleSection';
import { Button } from '../../common/Button/Button';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import {
  getLianLiWirelessState,
  bindLianLiWirelessFan,
  unbindLianLiWirelessFan,
  identifyLianLiWirelessFan,
  type LianLiWirelessFan,
  type LianLiWirelessState,
} from '../../../api/lianli-wireless';
import { useTranslation } from '../../../lib/i18n';
import styles from './LianLiWirelessDevicePage.module.scss';

// Polling interval matches the service RpmPollMs.
const RPM_POLL_MS = 2000;

// Bind/unbind converge on the service in ~2-6s; give up waiting for the
// state poll to confirm it and let the poll speak for itself past this.
const BIND_PENDING_TIMEOUT_MS = 10000;

type BindAction = 'bind' | 'unbind';

/** Fan subtype (fans_type[0]) -> i18n key suffix. */
export function fanTypeKey(fanType: number): 'fanTypeSlv3Lcd' | 'fanTypeSlv3Led' | 'fanTypeSlInfinity' | 'fanTypeGeneric' {
  if (fanType === 24) return 'fanTypeSlv3Lcd';
  if (fanType >= 20 && fanType <= 23) return 'fanTypeSlv3Led';
  if (fanType >= 36 && fanType <= 39) return 'fanTypeSlInfinity';
  return 'fanTypeGeneric';
}

/**
 * Routed page for the Lian Li L-Wireless controller (SLV3 2.4GHz dongle).
 * Read-only Phase 1 view: connection info + the discovered fan chains with
 * live RPM. Binding, RGB, fan speed and LCD controls land in later phases.
 */
export function LianLiWirelessDevicePage() {
  const { t } = useTranslation();
  const [connection, setConnection] = useState<'unknown' | 'connected' | 'disconnected'>('unknown');
  const [state, setState] = useState<LianLiWirelessState | null>(null);
  const [pending, setPending] = useState<Record<string, BindAction>>({});
  const [identifying, setIdentifying] = useState<Record<string, boolean>>({});
  const [unbindTarget, setUnbindTarget] = useState<string | null>(null);
  const aliveRef = useRef(true);
  const connectedRef = useRef(false);
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

  const refresh = useCallback(async () => {
    const s = await getLianLiWirelessState();
    if (!aliveRef.current) return;
    if (s === null) return;
    if (!s.isConnected) {
      connectedRef.current = false;
      setConnection('disconnected');
      setState(null);
      return;
    }
    connectedRef.current = true;
    setConnection('connected');
    setState(s);
  }, []);

  // Steady-state telemetry tick: refresh the fan list (RPM changes every
  // poll) without re-triggering the disconnected branch on a transient null.
  const refreshLive = useCallback(async () => {
    if (!connectedRef.current) { void refresh(); return; }
    const s = await getLianLiWirelessState();
    if (!aliveRef.current || s === null) return;
    if (!s.isConnected) {
      connectedRef.current = false;
      setConnection('disconnected');
      setState(null);
      return;
    }
    setState(s);
  }, [refresh]);

  useEffect(() => {
    aliveRef.current = true;
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    const id = window.setInterval(() => { void refreshLive(); }, RPM_POLL_MS);
    return () => {
      aliveRef.current = false;
      window.removeEventListener('focus', onFocus);
      window.clearInterval(id);
      for (const macId of Object.keys(pendingTimeoutsRef.current)) {
        window.clearTimeout(pendingTimeoutsRef.current[macId]);
      }
      pendingTimeoutsRef.current = {};
    };
  }, [refresh, refreshLive]);

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
    void bindLianLiWirelessFan(mac);
  }, [startPending]);

  const handleUnbindConfirmed = useCallback(() => {
    const mac = unbindTarget;
    setUnbindTarget(null);
    if (!mac) return;
    startPending(mac, 'unbind');
    void unbindLianLiWirelessFan(mac);
  }, [unbindTarget, startPending]);

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

  if (connection === 'disconnected') {
    return (
      <div className={styles.page}>
        {/* eslint-disable-next-line i18next/no-literal-string -- brand + model name */}
        <ViewHeader title="Lian Li Uni Fan Wireless" />
        <div className={`${styles.pageBody} pageBody`}>
          <Placeholder title={t('devices.lianli-wireless.notConnected')} />
        </div>
      </div>
    );
  }

  const loaded = state !== null;

  return (
    <div className={styles.page}>
      <ViewHeader
        // eslint-disable-next-line i18next/no-literal-string -- brand + model name
        title="Lian Li Uni Fan Wireless"
        actions={loaded ? <span className={styles.statusBadge}>{t('devices.lianli-wireless.connected')}</span> : null}
      />
      <div className={`${styles.pageBody} pageBody`}>
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
            : <p className={styles.emptyNote}>{t('devices.lianli-wireless.noFansPaired')}</p>}
        </SettingsSection>
      </div>

      <ConfirmModal
        open={unbindTarget != null}
        title={t('devices.lianli-wireless.unbindConfirmTitle')}
        message={t('devices.lianli-wireless.unbindConfirmMessage')}
        confirmLabel={t('devices.lianli-wireless.unbindConfirmLabel')}
        onCancel={() => setUnbindTarget(null)}
        onConfirm={handleUnbindConfirmed}
      />
    </div>
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
  const [open, setOpen] = useState(true);
  const typeLabel = t(`devices.lianli-wireless.${fanTypeKey(fan.fanType)}` as Parameters<typeof t>[0]);
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
        {fan.rpm.slice(0, fan.fanCount).map((rpm, i) => (
          <div key={i} className={styles.row}>
            <span className={styles.rowLabel}>{t('devices.lianli-wireless.fanN', { n: i + 1 })}</span>
            <span className={styles.rowValue}>
              <Fan size={12} aria-hidden />
              {rpm > 0 ? `${rpm.toLocaleString()} RPM` : '-'}
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

export default LianLiWirelessDevicePage;
