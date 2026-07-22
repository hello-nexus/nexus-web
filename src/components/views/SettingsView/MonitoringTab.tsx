import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingRow } from '../../common/SettingRow/SettingRow';
import { ChipGroup } from '../../common/ChipGroup/ChipGroup';
import { LightingCoolingSection } from './LightingCoolingSection';
import { useTranslation } from '../../../lib/i18n';
import type { NexusSettings } from '../../../lib/settings';
import type { TempUnit } from '../../../lib/units';
import styles from './SettingsView.module.scss';

export interface MonitoringTabProps {
  settings: NexusSettings;
  updateGeneral: (patch: Partial<NexusSettings['general']>) => void;
  serviceOnline: boolean;
  platform: string;
}

export function MonitoringTab({ settings, updateGeneral, serviceOnline, platform }: MonitoringTabProps) {
  const { t } = useTranslation();

  return (
    <div className={styles.tabPanel}>
      <SettingsSection>
        <SettingRow
          label={t('settings.units.temperature.label')}
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

      <LightingCoolingSection serviceOnline={serviceOnline} platform={platform} />
    </div>
  );
}
