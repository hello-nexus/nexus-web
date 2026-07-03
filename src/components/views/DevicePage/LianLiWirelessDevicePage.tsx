import { useCallback, useEffect, useRef, useState } from 'react';
import { Fan } from 'lucide-react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { Placeholder } from '../Placeholder';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { CollapsibleSection } from '../../common/CollapsibleSection/CollapsibleSection';
import {
  getLianLiWirelessState,
  type LianLiWirelessFan,
  type LianLiWirelessState,
} from '../../../api/lianli-wireless';
import { useTranslation } from '../../../lib/i18n';
import styles from './LianLiWirelessDevicePage.module.scss';

// Polling interval matches the service RpmPollMs.
const RPM_POLL_MS = 2000;

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
  const aliveRef = useRef(true);
  const connectedRef = useRef(false);

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
    };
  }, [refresh, refreshLive]);

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
            ? state.fans.map(fan => <FanChain key={fan.mac} fan={fan} />)
            : <p className={styles.emptyNote}>{t('devices.lianli-wireless.noFansPaired')}</p>}
        </SettingsSection>
      </div>
    </div>
  );
}

function FanChain({ fan }: { fan: LianLiWirelessFan }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const typeLabel = t(`devices.lianli-wireless.${fanTypeKey(fan.fanType)}` as Parameters<typeof t>[0]);

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
      </div>
    </CollapsibleSection>
  );
}

export default LianLiWirelessDevicePage;
