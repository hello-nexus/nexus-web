import { useTranslation } from '../../../lib/i18n';
import { useUiSettings } from '../../../hooks/useUiSettings';
import { ChipGroup } from '../../common/ChipGroup/ChipGroup';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingRow, SettingToggle } from '../../common/SettingRow/SettingRow';
import { COOLDOWN_OPTIONS_MINUTES, durationOptions } from './notificationCooldown';

/** Desktop notifications for sensor alerts: a master switch and the minimum gap between two toasts for the same sensor. Both persist in the diagnostics preferences. */
export function SensorNotificationSettings() {
  const { t } = useTranslation();
  const { settings, update } = useUiSettings();
  const enabled = settings.diagnosticsSensorNotifications;
  const cooldownOptions = durationOptions(t, COOLDOWN_OPTIONS_MINUTES).map(o => ({ ...o, disabled: !enabled }));
  return (
    <SettingsSection title={t('diagnostics.sensors.notifications.title')}>
      <SettingToggle
        label={t('diagnostics.sensors.notifications.master.label')}
        description={t('diagnostics.sensors.notifications.master.description')}
        checked={enabled}
        onChange={v => update({ diagnosticsSensorNotifications: v })}
      />
      <SettingRow
        label={t('diagnostics.sensors.notifications.cooldown.label')}
        description={t('diagnostics.sensors.notifications.cooldown.description')}
        disabled={!enabled}
      >
        <ChipGroup
          ariaLabel={t('diagnostics.sensors.notifications.cooldown.label')}
          activeKey={String(settings.diagnosticsSensorCooldownMinutes)}
          onChange={key => update({ diagnosticsSensorCooldownMinutes: Number(key) })}
          options={cooldownOptions}
        />
      </SettingRow>
    </SettingsSection>
  );
}
