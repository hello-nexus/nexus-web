import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { DIAGNOSTICS_SETTINGS_DEFAULTS, useUiSettings, type UiSettingsValue } from '../../../hooks/useUiSettings';
import { useSensorAlerts } from '../../../hooks/useSensorAlerts';
import { Button } from '../../common/Button/Button';
import { useToast } from '../../common/Toast/Toast';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { ChipGroup } from '../../common/ChipGroup/ChipGroup';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingGroup, SettingRow, SettingToggle } from '../../common/SettingRow/SettingRow';
import { COOLDOWN_OPTIONS_MINUTES, durationOptions } from '../DiagnosticsView/notificationCooldown';

type BoolKey = {
  [K in keyof UiSettingsValue]: UiSettingsValue[K] extends boolean ? K : never;
}[keyof UiSettingsValue];

const DEFAULT_PATCH: Partial<UiSettingsValue> = {
  diagnosticsNotificationsEnabled: DIAGNOSTICS_SETTINGS_DEFAULTS.notificationsEnabled,
  diagnosticsNotifyStorageHealth: DIAGNOSTICS_SETTINGS_DEFAULTS.notifyStorageHealth,
  diagnosticsNotifyCooling: DIAGNOSTICS_SETTINGS_DEFAULTS.notifyCooling,
  diagnosticsNotifyMemoryTest: DIAGNOSTICS_SETTINGS_DEFAULTS.notifyMemoryTest,
  diagnosticsNotifySystemDevices: DIAGNOSTICS_SETTINGS_DEFAULTS.notifySystemDevices,
  diagnosticsNotifyGpuThrottle: DIAGNOSTICS_SETTINGS_DEFAULTS.notifyGpuThrottle,
  diagnosticsNotificationCooldownMinutes: DIAGNOSTICS_SETTINGS_DEFAULTS.notificationCooldownMinutes,
  diagnosticsComponentRam: DIAGNOSTICS_SETTINGS_DEFAULTS.componentRam,
  diagnosticsComponentSystem: DIAGNOSTICS_SETTINGS_DEFAULTS.componentSystem,
  // Per-device ignores are deliberately not reset: the confirm copy promises
  // limits, notifications and monitoring, and each ignore is undone on its
  // own device card.
};

const NOTIFY_CHECKS: readonly { labelKey: string; setting: BoolKey }[] = [
  { labelKey: 'diagnostics.notify.storage', setting: 'diagnosticsNotifyStorageHealth' },
  { labelKey: 'diagnostics.notify.cooling', setting: 'diagnosticsNotifyCooling' },
  { labelKey: 'diagnostics.notify.gpuThrottle', setting: 'diagnosticsNotifyGpuThrottle' },
  { labelKey: 'diagnostics.notify.memoryTest', setting: 'diagnosticsNotifyMemoryTest' },
  { labelKey: 'diagnostics.notify.systemDevices', setting: 'diagnosticsNotifySystemDevices' },
];

/** Desktop notifications for diagnostics: the master switch, and beneath it (only while on) each check's switch and the cooldown between repeat alerts. */
export function DiagnosticsNotificationsSection() {
  const { t } = useTranslation();
  const { settings, update } = useUiSettings();
  const enabled = settings.diagnosticsNotificationsEnabled;
  const cooldownOptions = durationOptions(t, COOLDOWN_OPTIONS_MINUTES);
  return (
    <SettingsSection title={t('settings.diagnosticsNotifications.title')}>
      <SettingGroup>
        <SettingToggle
          label={t('settings.diagnosticsNotifications.health.label')}
          checked={enabled}
          onChange={v => update({ diagnosticsNotificationsEnabled: v })}
        />
        {enabled && NOTIFY_CHECKS.map(spec => (
          <SettingToggle
            key={spec.setting}
            nested
            label={t(spec.labelKey)}
            checked={settings[spec.setting]}
            onChange={v => update({ [spec.setting]: v })}
          />
        ))}
        {enabled && (
          <SettingRow
            nested
            label={t('diagnostics.settings.notifications.cooldown.label')}
            description={t('diagnostics.settings.notifications.cooldown.description')}
            wrapControl
          >
            <ChipGroup
              ariaLabel={t('diagnostics.settings.notifications.cooldown.label')}
              activeKey={String(settings.diagnosticsNotificationCooldownMinutes)}
              onChange={key => update({ diagnosticsNotificationCooldownMinutes: Number(key) })}
              options={cooldownOptions}
            />
          </SettingRow>
        )}
      </SettingGroup>
    </SettingsSection>
  );
}

/** Danger zone: restores the diagnostics preferences and the built-in temperature sensors to their defaults. */
export function DiagnosticsResetSection() {
  const { t } = useTranslation();
  const { update } = useUiSettings();
  const { push } = useToast();
  const alerts = useSensorAlerts(true);
  const [resetOpen, setResetOpen] = useState(false);

  const doReset = () => {
    update(DEFAULT_PATCH);
    void alerts.resetBuiltIns().then(ok => { if (!ok) push({ title: t('diagnostics.alerts.saveFailed') }); });
    setResetOpen(false);
  };

  return (
    <>
      {/* eslint-disable-next-line i18next/no-literal-string -- CSS variable token */}
      <SettingsSection title={t('settings.dangerZone')} titleStyle={{ color: 'var(--bad)' }}>
        <SettingRow
          label={t('diagnostics.settings.reset.label')}
          description={t('diagnostics.settings.reset.description')}
        >
          <Button type="button" tone="danger" size="sm" icon={<RotateCcw size={13} />} onClick={() => setResetOpen(true)}>
            {t('cooling.settings.reset')}
          </Button>
        </SettingRow>
      </SettingsSection>
      <ConfirmModal
        open={resetOpen}
        title={t('cooling.settings.reset')}
        message={t('diagnostics.settings.resetConfirm')}
        confirmLabel={t('cooling.settings.reset')}
        destructive
        onConfirm={doReset}
        onCancel={() => setResetOpen(false)}
      />
    </>
  );
}
