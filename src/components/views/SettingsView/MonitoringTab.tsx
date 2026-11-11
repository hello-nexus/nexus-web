import { Activity, Stethoscope, Zap } from 'lucide-react';
import { Badge } from '../../common/Badge/Badge';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingToggle } from '../../common/SettingRow/SettingRow';
import { MonitoringEventsSettings } from '../../../panel/widgets/monitoring/page/MonitoringEventsSettings';
import { DiagnosticsNotificationsSection, DiagnosticsResetSection } from './DiagnosticsSettingsSections';
import { SmartPollSection } from './SmartPollSection';
import { RamTemperatureSection } from './RamTemperatureSection';
import { useUiSettings } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import type { NexusSettings } from '../../../lib/settings';
import styles from './SettingsView.module.scss';

export interface MonitoringTabProps {
  settings: NexusSettings;
  updateGeneral: (patch: Partial<NexusSettings['general']>) => void;
  serviceOnline: boolean;
}

export function MonitoringTab({ settings, updateGeneral, serviceOnline }: MonitoringTabProps) {
  const { t } = useTranslation();
  const { settings: ui, update } = useUiSettings();

  return (
    <div className={styles.tabPanel}>
      <SettingsSection title={t('settings.features.title')}>
        <SettingToggle
          label={t('settings.features.monitoring.label')}
          labelSuffix={<Badge label={t('settings.features.master')} color="var(--accent)" />}
          description={t('settings.features.monitoring.description')}
          icon={<Activity />}
          iconLeading="subtle"
          anchorId="set-feature-monitoring"
          checked={settings.general.featureMonitoringEnabled}
          onChange={checked => updateGeneral({ featureMonitoringEnabled: checked })}
        />
        <SettingToggle
          label={t('settings.features.diagnostics.label')}
          labelSuffix={<Badge label={t('settings.features.master')} color="var(--accent)" />}
          description={t('settings.features.diagnostics.description')}
          icon={<Stethoscope />}
          iconLeading="subtle"
          anchorId="set-feature-diagnostics"
          checked={settings.general.featureDiagnosticsEnabled}
          onChange={checked => updateGeneral({ featureDiagnosticsEnabled: checked })}
        />
      </SettingsSection>

      <SettingsSection title={t('settings.hardwareSensors.title')}>
        <SettingToggle
          label={t('settings.powerMonitors.label')}
          description={t('settings.powerMonitors.description')}
          icon={<Zap />}
          iconLeading="subtle"
          anchorId="set-power-monitors"
          checked={ui.powerMonitorsEnabled}
          onChange={v => update({ powerMonitorsEnabled: v })}
          disabled={!serviceOnline}
        />
      </SettingsSection>

      <MonitoringEventsSettings />

      <RamTemperatureSection serviceOnline={serviceOnline} />

      <SmartPollSection serviceOnline={serviceOnline} />

      <DiagnosticsNotificationsSection />

      <DiagnosticsResetSection />
    </div>
  );
}
