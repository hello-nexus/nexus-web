import { useEffect, useState } from 'react';
import { Button } from '../../common/Button/Button';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingRow, SettingToggle } from '../../common/SettingRow/SettingRow';
import { ScreenTimeDataControl } from '../ScreenTimeBrowse/ScreenTimeDataControl';
import { AiIntegrationSection } from './AiIntegrationSection';
import { fetchService, postService } from '../../../api/service';
import { useTranslation } from '../../../lib/i18n';
import { buildTelemetryConsentDescription } from '../../../lib/telemetryConsent';
import { HeartBurst, useHeartBurstTrigger } from '../../common/HeartBurst/HeartBurst';
import type { NexusSettings } from '../../../lib/settings';
import styles from './SettingsView.module.scss';

export interface PrivacyTabProps {
  settings: NexusSettings;
  serviceOnline: boolean;
}

export function PrivacyTab({ settings, serviceOnline }: PrivacyTabProps) {
  const { t } = useTranslation();
  const [screenTimeOpen, setScreenTimeOpen] = useState(false);
  // Telemetry consent is server-authoritative (the service gates sending), so
  // it's fetched/written directly like auto-start, not via the local UI store.
  const [telemetryOn, setTelemetryOn] = useState<boolean | null>(null);
  const [telemetryLoading, setTelemetryLoading] = useState(false);
  const telemetryBurstKey = useHeartBurstTrigger(telemetryOn);

  // Hydrate the telemetry opt-in from the loopback-only consent endpoint. Stays
  // null (toggle hidden) on surfaces that can't reach it, e.g. a paired phone.
  useEffect(() => {
    if (!serviceOnline) return;
    let cancelled = false;
    fetchService<{ enabled: boolean }>('/telemetry/consent').then(data => {
      if (data && !cancelled) setTelemetryOn(data.enabled);
    });
    return () => { cancelled = true; };
  }, [serviceOnline]);

  // Optimistic: flip the toggle immediately so the row never dims/disables
  // (and its text never flashes) for the loopback round trip - reconcile to
  // the server's echoed value on response, or roll back on failure.
  const toggleTelemetry = async () => {
    if (telemetryOn === null || telemetryLoading) return;
    const previous = telemetryOn;
    setTelemetryOn(!previous);
    setTelemetryLoading(true);
    const resp = await postService<{ enabled: boolean }>('/telemetry/consent', {
      enabled: !previous,
    });
    setTelemetryOn(resp ? resp.enabled : previous);
    setTelemetryLoading(false);
  };

  return (
    <div className={styles.tabPanel}>
      <SettingsSection title={t('settings.privacy.title')}>
        {telemetryOn !== null && (
          <div className={styles.telemetryRow}>
            <SettingToggle
              label={t('settings.telemetry.label')}
              anchorId="set-telemetry"
              description={buildTelemetryConsentDescription(t)}
              checked={telemetryOn}
              onChange={toggleTelemetry}
              disabled={!serviceOnline}
            />
            <HeartBurst burstKey={telemetryBurstKey} />
          </div>
        )}
        <SettingRow
          label={t('settings.screentime.title')}
          anchorId="set-screentime"
          description={t('settings.screentime.trackingDesc')}
        >
          <Button
            type="button"
            tone="neutral"
            size="sm"
            onClick={() => setScreenTimeOpen(true)}
            disabled={!serviceOnline}
          >
            {t('settings.screentime.openButton')}
          </Button>
        </SettingRow>
      </SettingsSection>

      <ScreenTimeDataControl
        open={screenTimeOpen}
        onClose={() => setScreenTimeOpen(false)}
        onChanged={() => { /* settings page doesn't need to refetch */ }}
      />

      <AiIntegrationSection serviceOnline={serviceOnline} numberFormat={settings.general.numberFormat} />
    </div>
  );
}
