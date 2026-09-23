import { useCallback, useEffect, useRef, useState } from 'react';
import { Fan, Lightbulb, MonitorSmartphone, Thermometer, Unplug } from 'lucide-react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { getLianLiWirelessState, type LianLiWirelessLinkStatus, type LianLiWirelessState } from '../../../api/lianli-wireless';
import { ConflictAppCard } from '../../common/ConflictAppCard/ConflictAppCard';
import { L_CONNECT_CONFLICT_ID } from '../../../api/conflicts';
import { useConflictApps } from '../../../hooks/useConflictApps';
import { useTranslation } from '../../../lib/i18n';
import { LianLiWirelessFansTab, isFanDevice } from './LianLiWirelessFansTab';
import { LianLiWirelessCoolingTab } from './LianLiWirelessCoolingTab';
import { LianLiWirelessLightingTab } from './LianLiWirelessLightingTab';
import { LianLiWirelessScreenTab } from './LianLiWirelessScreenTab';
import styles from './LianLiWirelessDevicePage.module.scss';

// Polling interval matches the service RpmPollMs.
const RPM_POLL_MS = 2000;

type LianLiWirelessTab = 'fans' | 'lighting' | 'cooling' | 'screen';

// Strimer Wireless dev_types with a known LED layout; the service lists only these.
const isStrimerDevType = (devType: number) => devType >= 1 && devType <= 4;

// One hint line under the disconnected title. 'none' has none: the title
// already says nothing is connected.
const LINK_HINT_KEYS: Partial<Record<LianLiWirelessLinkStatus, string>> = {
  txMissing: 'devices.lianli-wireless.linkTxMissing',
  rxMissing: 'devices.lianli-wireless.linkRxMissing',
  busy: 'devices.lianli-wireless.linkBusy',
  openFailed: 'devices.lianli-wireless.linkOpenFailed',
  noResponse: 'devices.lianli-wireless.linkNoResponse',
};

interface LianLiWirelessDevicePageProps {
  onSectionNavigate?: (section: string) => void;
}

/**
 * Routed page for the Lian Li L-Wireless controller (SLV3 2.4GHz dongle).
 * Owns the connection poll and the active-tab state; each tab renders its
 * own controls from its own file.
 */
export function LianLiWirelessDevicePage({ onSectionNavigate }: LianLiWirelessDevicePageProps) {
  const { t } = useTranslation();
  const [connection, setConnection] = useState<'unknown' | 'connected' | 'disconnected'>('unknown');
  const [state, setState] = useState<LianLiWirelessState | null>(null);
  const [linkStatus, setLinkStatus] = useState<LianLiWirelessLinkStatus | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<LianLiWirelessTab>('fans');
  const aliveRef = useRef(true);
  const connectedRef = useRef(false);

  const refresh = useCallback(async () => {
    const s = await getLianLiWirelessState();
    if (!aliveRef.current) return;
    if (s === null) return;
    setLinkStatus(s.linkStatus);
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
    setLinkStatus(s.linkStatus);
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

  const disconnected = connection === 'disconnected';
  const hintKey = linkStatus ? LINK_HINT_KEYS[linkStatus] : undefined;
  // Only polled while the reason for being down is an app holding the dongle.
  const { conflicts } = useConflictApps(disconnected && linkStatus === 'busy');
  const blockingApp = conflicts.find(c => c.id === L_CONNECT_CONFLICT_ID);

  const hasStrimer = !!state?.fans.some(f => f.boundToUs && isStrimerDevType(f.devType));
  const hasFans = !!state?.fans.some(f => f.boundToUs && isFanDevice(f.devType));
  const tabs = [
    { key: 'fans', label: t('devices.lianli-wireless.tab.devices'), icon: <Fan size={14} /> },
    ...(hasStrimer ? [{ key: 'lighting', label: t('lighting.title'), icon: <Lightbulb size={14} /> }] : []),
    ...(hasFans ? [{ key: 'cooling', label: t('cooling.title'), icon: <Thermometer size={14} /> }] : []),
    { key: 'screen', label: t('devices.lianli-wireless.tab.screen'), icon: <MonitorSmartphone size={14} /> },
  ];

  return (
    <div className={styles.page}>
      <ViewHeader
        // eslint-disable-next-line i18next/no-literal-string -- brand + model name
        title="Lian Li L-Wireless Controller"
        tabs={disconnected ? undefined : tabs}
        activeTab={activeTab}
        onTabChange={key => setActiveTab(key as LianLiWirelessTab)}
      />
      <div className={`${styles.pageBody} pageBody`}>
        {disconnected && (
          <EmptyState
            icon={<Unplug size={40} />}
            title={t('devices.lianli-wireless.notConnected')}
            hint={hintKey ? t(hintKey) : undefined}
            action={blockingApp ? <ConflictAppCard conflict={blockingApp} /> : undefined}
          />
        )}
        {/* Tab body stays mounted across a transient disconnect so a fan's
            in-flight bind/unbind pending state survives the reconnect. */}
        <div className={styles.tabBody} hidden={disconnected}>
          {activeTab === 'fans' && (
            <LianLiWirelessFansTab state={state} refresh={refresh} />
          )}
          {activeTab === 'lighting' && hasStrimer && <LianLiWirelessLightingTab onSectionNavigate={onSectionNavigate} />}
          {activeTab === 'cooling' && hasFans && <LianLiWirelessCoolingTab state={state} onSectionNavigate={onSectionNavigate} />}
          {activeTab === 'screen' && <LianLiWirelessScreenTab />}
        </div>
      </div>
    </div>
  );
}

export default LianLiWirelessDevicePage;
