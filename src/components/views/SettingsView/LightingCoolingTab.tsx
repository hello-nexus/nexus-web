import { Fan, Lightbulb } from 'lucide-react';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingToggle } from '../../common/SettingRow/SettingRow';
import { LightingCoolingSection } from './LightingCoolingSection';
import { ManualRgbDevicesSection } from './ManualRgbDevicesSection';
import { useTranslation } from '../../../lib/i18n';
import type { NexusSettings } from '../../../lib/settings';
import styles from './SettingsView.module.scss';

export interface LightingCoolingTabProps {
  settings: NexusSettings;
  updateGeneral: (patch: Partial<NexusSettings['general']>) => void;
  serviceOnline: boolean;
  platform: string;
}

export function LightingCoolingTab({ settings, updateGeneral, serviceOnline, platform }: LightingCoolingTabProps) {
  const { t } = useTranslation();

  return (
    <div className={styles.tabPanel}>
      <SettingsSection title={t('settings.features.title')}>
        <SettingToggle
          label={t('settings.features.lighting.label')}
          description={t('settings.features.lighting.description')}
          icon={<Lightbulb />}
          iconLeading="subtle"
          anchorId="set-feature-lighting"
          checked={settings.general.featureLightingEnabled}
          onChange={checked => updateGeneral({ featureLightingEnabled: checked })}
        />
        <SettingToggle
          label={t('settings.features.cooling.label')}
          description={t('settings.features.cooling.description')}
          icon={<Fan />}
          iconLeading="subtle"
          anchorId="set-feature-cooling"
          checked={settings.general.featureCoolingEnabled}
          onChange={checked => updateGeneral({ featureCoolingEnabled: checked })}
        />
      </SettingsSection>

      <LightingCoolingSection serviceOnline={serviceOnline} platform={platform} />

      <ManualRgbDevicesSection serviceOnline={serviceOnline} />
    </div>
  );
}
