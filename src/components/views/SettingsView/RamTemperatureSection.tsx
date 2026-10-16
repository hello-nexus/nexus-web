import { MemoryStick } from 'lucide-react';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingToggle } from '../../common/SettingRow/SettingRow';
import { useUiSettings } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';

/** Some boards fail to restart while the memory sensor chip is being read, so the read is the user's call. */
export function RamTemperatureSection({ serviceOnline }: { serviceOnline: boolean }) {
  const { t } = useTranslation();
  const { settings, update } = useUiSettings();

  return (
    <SettingsSection>
      <SettingToggle
        label={t('settings.ramTemperatures.label')}
        description={t('settings.ramTemperatures.description')}
        icon={<MemoryStick />}
        iconLeading="subtle"
        anchorId="set-read-ram-temperatures"
        checked={settings.readRamTemperatures ?? true}
        onChange={v => update({ readRamTemperatures: v })}
        disabled={!serviceOnline}
      />
    </SettingsSection>
  );
}
