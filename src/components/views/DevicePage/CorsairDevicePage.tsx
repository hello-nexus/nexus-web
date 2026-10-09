import { Fan, Lightbulb, RefreshCw, Thermometer, Unplug } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { corsairHubs, getCorsairState, rescanCorsairHub, type CorsairState } from '../../../api/corsair';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { convertTemperature, formatNumber, localizeNumbers, tempUnitSymbol } from '../../../lib/units';
import { Button } from '../../common/Button/Button';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import styles from './CorsairDevicePage.module.scss';
import { useReportDeviceWaiting } from './deviceDetecting';

// Re-enumerates the chain each tick so a fan moved between ports or hot-plugged
// shows up without a manual refresh; the service re-detects on its own poll.
const RPM_POLL_MS = 2000;

interface CorsairDevicePageProps {
  onSectionNavigate?: (section: string) => void;
}

export function CorsairDevicePage({ onSectionNavigate }: CorsairDevicePageProps) {
  const { t } = useTranslation();
  const { monitoringTempUnit, numberFormat } = useUnitPrefs();
  const [connection, setConnection] = useState<'unknown' | 'connected' | 'disconnected'>('unknown');
  useReportDeviceWaiting(connection !== 'connected');
  const [state, setState] = useState<CorsairState | null>(null);
  const [rescanning, setRescanning] = useState<ReadonlySet<string>>(new Set());
  const aliveRef = useRef(true);
  const connectedRef = useRef(false);

  const refresh = useCallback(async () => {
    const s = await getCorsairState();
    if (!aliveRef.current) return;
    if (s === null) return;
    if (!corsairHubs(s).some(h => h.isConnected)) {
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
    if (!corsairHubs(s).some(h => h.isConnected)) {
      connectedRef.current = false;
      setConnection('disconnected');
      setState(null);
      return;
    }
    // Replace the whole state so a port change (add/remove/move) or a finished re-scan is reflected.
    setState(s);
  }, [refresh]);

  const rescan = useCallback(async (hubId: string) => {
    setRescanning(prev => new Set(prev).add(hubId));
    try {
      await rescanCorsairHub(hubId);
      await refreshLive();
    } finally {
      if (aliveRef.current) {
        setRescanning(prev => {
          const next = new Set(prev);
          next.delete(hubId);
          return next;
        });
      }
    }
  }, [refreshLive]);

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

  const hubs = state ? corsairHubs(state) : [];
  const multiHub = hubs.length > 1;

  return (
    <div className={styles.page}>
      {/* eslint-disable-next-line i18next/no-literal-string -- brand + model name */}
      <ViewHeader title="Corsair iCUE LINK Hub" />
      <div className={`${styles.pageBody} pageBody`}>
        {hubs.map(hub => {
          const busy = hub.redetecting || rescanning.has(hub.id);
          return (
            <SettingsSection
              key={hub.id}
              title={multiHub
                ? t('devices.corsair.hubDevicesSection', { n: hub.number })
                : t('devices.corsair.devicesSection')}
              boxClassName={styles.sectionBox}
              action={
                <div className={styles.hubActions}>
                  {hub.firmware && (
                    <span className={styles.savingBadge}>fw {hub.firmware}</span>
                  )}
                  <Button
                    size="sm"
                    tone="neutral"
                    icon={<RefreshCw size={14} />}
                    title={t('devices.corsair.rescanHint')}
                    disabled={busy || !hub.isConnected}
                    onClick={() => { void rescan(hub.id); }}
                  >
                    {busy ? t('devices.corsair.rescanning') : t('devices.corsair.rescan')}
                  </Button>
                </div>
              }
            >
              {hub.devices.map(device => (
                <div key={device.channel} className={styles.row}>
                  <span className={styles.channelBadge}>
                    {t('devices.corsair.channel', { n: device.channel })}
                  </span>
                  <span className={styles.rowLabel}>{device.name}</span>
                  <span className={styles.rowValue}>
                    {device.ledCount > 0 && t('devices.corsair.leds', { n: device.ledCount })}
                  </span>
                  <span className={styles.rowValue}>
                    {device.hasSpeed && (
                      <>
                        <Fan size={12} aria-hidden />
                        {device.rpm > 0 ? `${formatNumber(device.rpm, numberFormat)} RPM` : '-'}
                      </>
                    )}
                  </span>
                  <span className={styles.rowValue}>
                    {device.hasTemperature && (
                      <>
                        <Thermometer size={12} aria-hidden />
                        {device.tempC != null ? localizeNumbers(`${convertTemperature(device.tempC, monitoringTempUnit).toFixed(1)} ${tempUnitSymbol(monitoringTempUnit)}`, numberFormat) : '-'}
                      </>
                    )}
                  </span>
                </div>
              ))}
            </SettingsSection>
          );
        })}

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
