import { useCallback, useEffect, useRef, useState } from 'react';
import { Fan, Thermometer, MonitorSmartphone, Unplug } from 'lucide-react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { getLianLiWirelessState, type LianLiWirelessState } from '../../../api/lianli-wireless';
import { useTranslation } from '../../../lib/i18n';
import { LianLiWirelessFansTab } from './LianLiWirelessFansTab';
import { LianLiWirelessCoolingTab } from './LianLiWirelessCoolingTab';
import { LianLiWirelessScreenTab } from './LianLiWirelessScreenTab';
import styles from './LianLiWirelessDevicePage.module.scss';

// Polling interval matches the service RpmPollMs.
const RPM_POLL_MS = 2000;

type LianLiWirelessTab = 'fans' | 'cooling' | 'screen';

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
  const [activeTab, setActiveTab] = useState<LianLiWirelessTab>('fans');
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

  const disconnected = connection === 'disconnected';
  const loaded = state !== null;

  const tabs = [
    { key: 'fans', label: t('devices.lianli-wireless.tab.fans'), icon: <Fan size={14} /> },
    { key: 'cooling', label: t('devices.lianli-wireless.tab.cooling'), icon: <Thermometer size={14} /> },
    { key: 'screen', label: t('devices.lianli-wireless.tab.screen'), icon: <MonitorSmartphone size={14} /> },
  ];

  return (
    <div className={styles.page}>
      <ViewHeader
        // eslint-disable-next-line i18next/no-literal-string -- brand + model name
        title="Lian Li Uni Fan Wireless"
        tabs={disconnected ? undefined : tabs}
        activeTab={activeTab}
        onTabChange={key => setActiveTab(key as LianLiWirelessTab)}
        actions={loaded ? <span className={styles.statusBadge}>{t('devices.lianli-wireless.connected')}</span> : null}
      />
      <div className={`${styles.pageBody} pageBody`}>
        {disconnected && <EmptyState icon={<Unplug size={40} />} title={t('devices.lianli-wireless.notConnected')} />}
        {/* Tab body stays mounted across a transient disconnect so a fan's
            in-flight bind/unbind pending state survives the reconnect. */}
        <div className={styles.tabBody} hidden={disconnected}>
          {activeTab === 'fans' && <LianLiWirelessFansTab state={state} refresh={refresh} />}
          {activeTab === 'cooling' && (
            <LianLiWirelessCoolingTab state={state} onSectionNavigate={onSectionNavigate} />
          )}
          {activeTab === 'screen' && <LianLiWirelessScreenTab />}
        </div>
      </div>
    </div>
  );
}

export default LianLiWirelessDevicePage;
