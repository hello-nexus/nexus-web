import { Activity, Stethoscope, Thermometer } from 'lucide-react';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingRow, SettingToggle } from '../../common/SettingRow/SettingRow';
import { ChipGroup } from '../../common/ChipGroup/ChipGroup';
import { MonitoringEventsSettings } from '../../../panel/widgets/monitoring/page/MonitoringEventsSettings';
import { SmartPollSection } from './SmartPollSection';
import { useTranslation } from '../../../lib/i18n';
import type { NexusSettings } from '../../../lib/settings';
import type { TempUnit } from '../../../lib/units';
import styles from './SettingsView.module.scss';

export interface MonitoringTabProps {
  settings: NexusSettings;
  updateGeneral: (patch: Partial<NexusSettings['general']>) => void;
  serviceOnline: boolean;
}

export function MonitoringTab({ settings, updateGeneral, serviceOnline }: MonitoringTabProps) {
  const { t } = useTranslation();

  return (
    <div className={styles.tabPanel}>
      <SettingsSection>
        <SettingToggle
          label={t('settings.features.monitoring.label')}
          description={t('settings.features.monitoring.description')}
          icon={<Activity />}
          iconLeading="subtle"
          anchorId="set-feature-monitoring"
          checked={settings.general.featureMonitoringEnabled}
          onChange={checked => updateGeneral({ featureMonitoringEnabled: checked })}
        />
        <SettingToggle
          label={t('settings.features.diagnostics.label')}
          description={t('settings.features.diagnostics.description')}
          icon={<Stethoscope />}
          iconLeading="subtle"
          anchorId="set-feature-diagnostics"
          checked={settings.general.featureDiagnosticsEnabled}
          onChange={checked => updateGeneral({ featureDiagnosticsEnabled: checked })}
        />
      </SettingsSection>

      <SettingsSection>
        <SettingRow
          label={t('settings.units.temperature.label')}
          icon={<Thermometer />}
          iconLeading="subtle"
          anchorId="set-temp-unit"
          description={t('settings.units.temperature.description')}
        >
          <ChipGroup
            ariaLabel={t('settings.units.temperature.label')}
            activeKey={settings.general.monitoringTempUnit}
            onChange={k => updateGeneral({ monitoringTempUnit: k as TempUnit })}
            options={[
              // eslint-disable-next-line i18next/no-literal-string -- temperature unit enum value
              { key: 'c', label: t('settings.units.temperature.celsius') },
              // eslint-disable-next-line i18next/no-literal-string -- temperature unit enum value
              { key: 'f', label: t('settings.units.temperature.fahrenheit') },
            ]}
          />
        </SettingRow>
      </SettingsSection>

      <MonitoringEventsSettings />

      <SmartPollSection serviceOnline={serviceOnline} />
    </div>
  );
}
