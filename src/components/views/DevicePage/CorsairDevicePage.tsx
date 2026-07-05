import { Fan, Lightbulb, Thermometer, Unplug } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getCorsairState, type CorsairState } from '../../../api/corsair';
import { useTranslation } from '../../../lib/i18n';
import { Button } from '../../common/Button/Button';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import styles from './CorsairDevicePage.module.scss';

// Re-enumerates the chain each tick so a fan moved between ports or hot-plugged
// shows up without a manual refresh; the service re-detects on its own poll.
const RPM_POLL_MS = 2000;

interface CorsairDevicePageProps {
  onSectionNavigate?: (section: string) => void;
}

export function CorsairDevicePage({ onSectionNavigate }: CorsairDevicePageProps) {
  const { t } = useTranslation();
  const [connection, setConnection] = useState<'unknown' | 'connected' | 'disconnected'>('unknown');
  const [state, setState] = useState<CorsairState | null>(null);
  const aliveRef = useRef(true);
  const connectedRef = useRef(false);

  const refresh = useCallback(async () => {
    const s = await getCorsairState();
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

  const refreshLive = useCallback(async () => {
    if (!connectedRef.current) { void refresh(); return; }
    const s = await getCorsairState();
    if (!aliveRef.current || s === null) return;
    if (!s.isConnected) {
      connectedRef.current = false;
      setConnection('disconnected');
      setState(null);
      return;
    }
    // Replace the whole device list so a port change (add/remove/move) is reflected.
    setState(prev => prev ? { ...prev, devices: s.devices } : s);
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
        <ViewHeader title="Corsair iCUE LINK Hub" />
        <div className={`${styles.pageBody} pageBody`}>
          <EmptyState icon={<Unplug size={40} />} title={t('devices.corsair.notConnected')} />
        </div>
      </div>
    );
  }

  const loaded = state !== null;

  return (
    <div className={styles.page}>
      <ViewHeader
        // eslint-disable-next-line i18next/no-literal-string -- brand + model name
        title="Corsair iCUE LINK Hub"
        actions={
          state?.firmware
            // eslint-disable-next-line i18next/no-literal-string -- firmware label prefix
            ? <span className={styles.savingBadge}>fw {state.firmware}</span>
            : undefined
        }
      />
      <div className={`${styles.pageBody} pageBody`}>
        <SettingsSection
          title={t('devices.corsair.devicesSection')}
          boxClassName={styles.sectionBox}
        >
          {loaded
            ? state.devices.map(device => (
                <div key={device.channel} className={styles.row}>
                  <span className={styles.channelBadge}>
                    {t('devices.corsair.channel', { n: device.channel })}
                  </span>
                  <span className={styles.rowLabel}>{device.name}</span>
                  {device.ledCount > 0 && (
                    <span className={styles.rowValue}>
                      {t('devices.corsair.leds', { n: device.ledCount })}
                    </span>
                  )}
                  {device.hasSpeed && (
                    <span className={styles.rowValue}>
                      <Fan size={12} aria-hidden />
                      {device.rpm > 0 ? `${device.rpm.toLocaleString()} RPM` : '-'}
                    </span>
                  )}
                  {device.hasTemperature && (
                    <span className={styles.rowValue}>
                      <Thermometer size={12} aria-hidden />
                      {device.tempC != null ? `${device.tempC.toFixed(1)} °C` : '-'}
                    </span>
                  )}
                </div>
              ))
            : null}
        </SettingsSection>

        {onSectionNavigate && (
          <SettingsSection boxClassName={styles.sectionBox} title={null}>
            <p className={styles.hintNote} data-settings-aside="true">{t('devices.corsair.coolingHint')}</p>
            <p className={styles.hintNote} data-settings-aside="true">{t('devices.corsair.lightingHint')}</p>
            <div className={styles.hintActions} data-settings-aside="true">
              <Button
                size="sm"
                tone="neutral"
                icon={<Fan size={14} />}
                onClick={() => onSectionNavigate('cooling')}
              >
                {t('devices.corsair.goToCooling')}
              </Button>
              <Button
                size="sm"
                tone="neutral"
                icon={<Lightbulb size={14} />}
                onClick={() => onSectionNavigate('lighting')}
              >
                {t('devices.corsair.goToLighting')}
              </Button>
            </div>
          </SettingsSection>
        )}
      </div>
    </div>
  );
}
