import { useCallback, useEffect, useRef, useState } from 'react';
import { Fan, GaugeCircle, Thermometer } from 'lucide-react';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { CollapsibleSection } from '../../common/CollapsibleSection/CollapsibleSection';
import { HoverTooltip } from '../../common/HoverTooltip/HoverTooltip';
import { SettingToggle } from '../../common/SettingRow/SettingRow';
import { Slider } from '../../common/Slider/Slider';
import { Button } from '../../common/Button/Button';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import {
  bindLianLiWirelessFan,
  unbindLianLiWirelessFan,
  identifyLianLiWirelessFan,
  type LianLiWirelessFan,
  type LianLiWirelessState,
} from '../../../api/lianli-wireless';
import { fetchFanChannels, setFanSpeed, releaseFanAuto, type FanChannel } from '../../../api/cooling';
import { buildLianLiWirelessCoolingChains, type LianLiWirelessCoolingChain, type LianLiWirelessCoolingPort } from './lianliWirelessCoolingUtils';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { formatNumber, localizeNumbers } from '../../../lib/units';
import styles from './LianLiWirelessDevicePage.module.scss';

// Bind/unbind converge on the service in ~2-6s; give up waiting for the
// state poll to confirm it and let the poll speak for itself past this.
const BIND_PENDING_TIMEOUT_MS = 10000;

// Matches the shell's wireless-state poll; the generic cooling channels the
// service derives from that same telemetry move on the same cadence.
const FAN_CHANNELS_POLL_MS = 2000;

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
  onSectionNavigate?: (section: string) => void;
}

/**
 * Fans tab: connection info + the discovered fan chains with live RPM,
 * bind/unbind/identify controls, and (for chains bound to us) the Auto/Manual
 * speed control for each port - driven through the generic cooling routes
 * (the service registers every bound port as a "lianli-wireless:{mac}:port{N}"
 * channel on IFanControlProvider/ICoolingProvider, Slv3CoolingProvider). Curve
 * assignment is intentionally not offered here; it stays on the central
 * Cooling page like every other fan channel. The shell owns the wireless
 * state poll; this tab owns the per-fan interaction, pending state, and its
 * own poll of the generic cooling channels.
 */
export function LianLiWirelessFansTab({ state, refresh, onSectionNavigate }: LianLiWirelessFansTabProps) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<Record<string, BindAction>>({});
  const [identifying, setIdentifying] = useState<Record<string, boolean>>({});
  const [unbindTarget, setUnbindTarget] = useState<string | null>(null);
  const [channels, setChannels] = useState<FanChannel[]>([]);
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

  const refreshChannels = useCallback(async () => {
    const r = await fetchFanChannels();
    if (aliveRef.current && r) setChannels(r.channels);
  }, []);

  useEffect(() => {
    void refreshChannels();
    const onFocus = () => { void refreshChannels(); };
    window.addEventListener('focus', onFocus);
    const id = window.setInterval(() => { void refreshChannels(); }, FAN_CHANNELS_POLL_MS);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.clearInterval(id);
    };
  }, [refreshChannels]);

  const handleSetAuto = useCallback((channelId: string) => {
    void releaseFanAuto(channelId).then(() => refreshChannels());
  }, [refreshChannels]);

  const handleSetManual = useCallback((channelId: string, percent: number) => {
    void setFanSpeed(channelId, percent).then(() => refreshChannels());
  }, [refreshChannels]);

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
  const coolingChains = buildLianLiWirelessCoolingChains(state?.fans ?? [], channels);
  const coolingByMac = new Map(coolingChains.map(c => [c.mac, c]));

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
        title={t('devices.lianli-wireless.devicesSection')}
        boxClassName={styles.sectionBox}
      >
        {loaded && state.fans.length > 0
          ? state.fans.map(fan => (
            <FanChain
              key={fan.mac}
              fan={fan}
              coolingChain={coolingByMac.get(fan.mac)}
              pending={pending[fan.mac]}
              identifying={!!identifying[fan.mac]}
              onBind={handleBind}
              onUnbindRequest={setUnbindTarget}
              onIdentify={handleIdentify}
              onSetAuto={handleSetAuto}
              onSetManual={handleSetManual}
            />
          ))
          : <p className={styles.emptyNote} data-settings-aside="true">{t('devices.lianli-wireless.noDevicesPaired')}</p>}
        <p className={styles.emptyNote} data-settings-aside="true">{t('devices.lianli-wireless.coolingCurveHint')}</p>
        {onSectionNavigate && (
          <div className={styles.actionsRow} data-settings-aside="true">
            <Button
              size="sm"
              tone="neutral"
              icon={<Thermometer size={14} />}
              onClick={() => onSectionNavigate('cooling')}
            >
              {t('devices.lianli-wireless.goToCooling')}
            </Button>
          </div>
        )}
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
  coolingChain,
  pending,
  identifying,
  onBind,
  onUnbindRequest,
  onIdentify,
  onSetAuto,
  onSetManual,
}: {
  fan: LianLiWirelessFan;
  coolingChain: LianLiWirelessCoolingChain | undefined;
  pending: BindAction | undefined;
  identifying: boolean;
  onBind: (mac: string) => void;
  onUnbindRequest: (mac: string) => void;
  onIdentify: (mac: string) => void;
  onSetAuto: (channelId: string) => void;
  onSetManual: (channelId: string, percent: number) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const typeLabel = t(`devices.lianli-wireless.${deviceTypeKey(fan.devType, fan.fanType)}` as Parameters<typeof t>[0]);
  const isFan = isFanDevice(fan.devType);
  const busy = pending !== undefined || identifying;

  // A bound chain's ports come from the cooling chain (which reflects the
  // controller's port count even when it reports no fans); an unbound chain has
  // no cooling channels, so fall back to its reported RPM slots (read-only).
  const portRows: LianLiWirelessCoolingPort[] = coolingChain?.ports
    ?? fan.rpm.slice(0, fan.fanCount).map((rpm, i) => ({ port: i, rpm, rpmUnavailable: false, channel: null }));

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
        {isFan && portRows.map(p => (
          <FanPortRow
            key={p.port}
            label={t('devices.lianli-wireless.fanN', { n: p.port + 1 })}
            rpm={p.rpm}
            rpmUnavailable={p.rpmUnavailable}
            channel={p.channel}
            showControls={fan.boundToUs}
            onSetAuto={onSetAuto}
            onSetManual={onSetManual}
          />
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

function FanPortRow({
  label,
  rpm,
  rpmUnavailable,
  channel,
  showControls,
  onSetAuto,
  onSetManual,
}: {
  label: string;
  rpm: number;
  rpmUnavailable: boolean;
  channel: FanChannel | null;
  showControls: boolean;
  onSetAuto: (channelId: string) => void;
  onSetManual: (channelId: string, percent: number) => void;
}) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const interactingRef = useRef(false);
  const [draft, setDraft] = useState(channel?.dutyPercent ?? 0);

  useEffect(() => {
    if (!interactingRef.current && channel) setDraft(channel.dutyPercent);
  }, [channel]);

  const loaded = channel !== null;
  const isCurve = channel?.mode === 'Curve';
  const isManual = channel?.mode === 'Manual';

  return (
    <div className={styles.portBlock}>
      <div className={styles.row}>
        <span className={styles.rowLabel}>{label}</span>
        {rpmUnavailable ? (
          <HoverTooltip body={t('devices.lianli-wireless.rpmUnavailableHint')}>
            <span className={styles.rowValueMuted}>
              <GaugeCircle size={12} aria-hidden />
              {t('devices.lianli-wireless.rpmUnavailable')}
            </span>
          </HoverTooltip>
        ) : (
          <span className={styles.rowValue}>
            <Fan size={12} aria-hidden />
            {rpm > 0 ? `${formatNumber(rpm, numberFormat)} RPM` : '-'}
          </span>
        )}
      </div>
      {showControls && (
        isCurve ? (
          <p className={styles.emptyNote}>{t('devices.lianli-wireless.coolingCurveActive')}</p>
        ) : (
          <>
            <SettingToggle
              label={t('devices.lianli-wireless.manualSpeed')}
              description={t('devices.lianli-wireless.manualSpeedHint')}
              checked={isManual}
              onChange={on => {
                if (!channel) return;
                if (on) onSetManual(channel.id, draft);
                else onSetAuto(channel.id);
              }}
              disabled={!loaded}
            />
            <Slider
              // eslint-disable-next-line i18next/no-literal-string -- slider layout enum
              orientation="stacked"
              editable
              trackFill
              label={t('devices.lianli-wireless.fanSpeed')}
              value={draft}
              min={0}
              max={100}
              step={1}
              formatValue={v => localizeNumbers(`${Math.round(v)}%`, numberFormat)}
              ariaLabel={t('devices.lianli-wireless.fanSpeed')}
              disabled={!isManual}
              onChange={(v, commit) => {
                const rounded = Math.round(v);
                if (commit) {
                  interactingRef.current = false;
                  setDraft(rounded);
                  if (channel) onSetManual(channel.id, rounded);
                  return;
                }
                interactingRef.current = true;
                setDraft(rounded);
              }}
              onCommit={v => {
                interactingRef.current = false;
                const rounded = Math.round(v);
                setDraft(rounded);
                if (channel) onSetManual(channel.id, rounded);
              }}
            />
          </>
        )
      )}
    </div>
  );
}
