import { useCallback, useEffect, useRef, useState } from 'react';
import { Thermometer, Unplug } from 'lucide-react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { Button } from '../../common/Button/Button';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { getLianLiTlState, type LianLiTlState } from '../../../api/lianli-tl';
import { useTranslation } from '../../../lib/i18n';
import styles from './LianLiDevicePage.module.scss';

// Polling interval matches the service RpmPollMs.
const RPM_POLL_MS = 2000;

interface LianLiTlDevicePageProps {
  onSectionNavigate?: (section: string) => void;
}

export function LianLiTlDevicePage({ onSectionNavigate }: LianLiTlDevicePageProps) {
  const { t } = useTranslation();
  const [connection, setConnection] = useState<'unknown' | 'connected' | 'disconnected'>('unknown');
  const [tlState, setTlState] = useState<LianLiTlState | null>(null);
  const aliveRef = useRef(true);
  const connectedRef = useRef(false);

  const refresh = useCallback(async () => {
    const s = await getLianLiTlState();
    if (!aliveRef.current) return;
    if (s === null) return;
    if (!s.isConnected) {
      connectedRef.current = false;
      setConnection('disconnected');
      setTlState(null);
      return;
    }
    connectedRef.current = true;
    setConnection('connected');
    setTlState(s);
  }, []);

  const refreshRpm = useCallback(async () => {
    if (!connectedRef.current) { void refresh(); return; }
    const s = await getLianLiTlState();
    if (!aliveRef.current || s === null) return;
    if (!s.isConnected) {
      connectedRef.current = false;
      setConnection('disconnected');
      setTlState(null);
      return;
    }
    setTlState(s);
  }, [refresh]);

  useEffect(() => {
    aliveRef.current = true;
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    const id = window.setInterval(() => { void refreshRpm(); }, RPM_POLL_MS);
    return () => {
      aliveRef.current = false;
      window.removeEventListener('focus', onFocus);
      window.clearInterval(id);
    };
  }, [refresh, refreshRpm]);

  if (connection === 'disconnected') {
    return (
      <div className={styles.page}>
        {/* eslint-disable-next-line i18next/no-literal-string -- brand + model name */}
        <ViewHeader title="Lian Li Uni Fan TL" />
        <div className={`${styles.pageBody} pageBody`}>
          <EmptyState icon={<Unplug size={40} />} title={t('devices.lianli-tl.notConnected')} />
        </div>
      </div>
    );
  }

  const stateLoaded = tlState !== null;

  return (
    <div className={styles.page}>
      {/* eslint-disable-next-line i18next/no-literal-string -- brand + model name */}
      <ViewHeader title="Lian Li Uni Fan TL" />
      <div className={`${styles.pageBody} pageBody`}>
        <SettingsSection
          title={t('devices.lianli-tl.fansSection')}
          boxClassName={styles.sectionBox}
        >
          {stateLoaded
            ? tlState.fans.map((fan, i) => (
                <div key={i} className={styles.row}>
                  <span className={styles.rowLabel}>
                    {t('devices.lianli-tl.fanLabel', { port: fan.port, n: fan.fanIndex })}
                  </span>
                  <span className={styles.rowValue}>{`${fan.rpm} RPM`}</span>
                  <span className={styles.rowValue}>{`${fan.duty}%`}</span>
                </div>
              ))
            : <div className={`${styles.row} ${styles.rowDisabled}`} />
          }
          <p className={styles.customNote} data-settings-aside="true">{t('devices.lianli-tl.coolingHint')}</p>
          {onSectionNavigate && (
            <Button
              className={styles.lightingLink}
              size="sm"
              tone="neutral"
              icon={<Thermometer size={14} />}
              onClick={() => onSectionNavigate('cooling')}
            >
              {t('devices.lianli-tl.goToCooling')}
            </Button>
          )}
        </SettingsSection>
      </div>
    </div>
  );
}
