import { MemoryStick } from 'lucide-react';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingToggle } from '../../common/SettingRow/SettingRow';
import { Button } from '../../common/Button/Button';
import { useUiSettings } from '../../../hooks/useUiSettings';
import { useDevices } from '../../../hooks/useDevices';
import { useTranslation } from '../../../lib/i18n';

const SMBUS_MEMORY_DEVICE_ID = 'smbus-dram';

/** Some boards fail to restart while the memory sensor chip is being read, so the read is the user's call. */
export function RamTemperatureSection({ serviceOnline, onOpenDevices }: { serviceOnline: boolean; onOpenDevices?: () => void }) {
  const { t } = useTranslation();
  const { settings, update } = useUiSettings();
  const { devices } = useDevices(serviceOnline);
  // The service reads only when the Memory device's Nexus Control gate AND this setting are on.
  const busOff = devices.some(d => d.id === SMBUS_MEMORY_DEVICE_ID && d.supportsNexusControl && d.nexusControlEnabled === false);

  return (
    <SettingsSection>
      <SettingToggle
        label={t('settings.ramTemperatures.label')}
        description={busOff ? (
          <>
            <span>{t('settings.ramTemperatures.busOff')}</span>
            {onOpenDevices && (
              <div>
                <Button tone="ghost" size="sm" onClick={onOpenDevices}>{t('settings.ramTemperatures.openDevices')}</Button>
              </div>
            )}
          </>
        ) : t('settings.ramTemperatures.description')}
        icon={<MemoryStick />}
        iconLeading="subtle"
        anchorId="set-read-ram-temperatures"
        checked={settings.readRamTemperatures}
        onChange={v => update({ readRamTemperatures: v })}
        disabled={!serviceOnline || busOff}
      />
    </SettingsSection>
  );
}
