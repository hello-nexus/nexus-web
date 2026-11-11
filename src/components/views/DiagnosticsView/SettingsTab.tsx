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
import { SettingRow, SettingToggle } from '../../common/SettingRow/SettingRow';
import { COOLDOWN_OPTIONS_MINUTES, durationOptions } from './notificationCooldown';

const DEFAULT_PATCH: Partial<UiSettingsValue> = {
  diagnosticsNotificationsEnabled: DIAGNOSTICS_SETTINGS_DEFAULTS.notificationsEnabled,
  diagnosticsNotifyStorageHealth: DIAGNOSTICS_SETTINGS_DEFAULTS.notifyStorageHealth,
  diagnosticsNotifyCooling: DIAGNOSTICS_SETTINGS_DEFAULTS.notifyCooling,
  diagnosticsNotifyMemoryTest: DIAGNOSTICS_SETTINGS_DEFAULTS.notifyMemoryTest,
  diagnosticsNotifySystemDevices: DIAGNOSTICS_SETTINGS_DEFAULTS.notifySystemDevices,
  diagnosticsNotifyGpuThrottle: DIAGNOSTICS_SETTINGS_DEFAULTS.notifyGpuThrottle,
  diagnosticsNotificationCooldownMinutes: DIAGNOSTICS_SETTINGS_DEFAULTS.notificationCooldownMinutes,
  diagnosticsSensorNotifications: DIAGNOSTICS_SETTINGS_DEFAULTS.sensorNotifications,
  diagnosticsSensorCooldownMinutes: DIAGNOSTICS_SETTINGS_DEFAULTS.sensorCooldownMinutes,
  diagnosticsComponentGpu: DIAGNOSTICS_SETTINGS_DEFAULTS.componentGpu,
  diagnosticsComponentStorage: DIAGNOSTICS_SETTINGS_DEFAULTS.componentStorage,
  diagnosticsComponentRam: DIAGNOSTICS_SETTINGS_DEFAULTS.componentRam,
  diagnosticsComponentCooling: DIAGNOSTICS_SETTINGS_DEFAULTS.componentCooling,
  diagnosticsComponentSystem: DIAGNOSTICS_SETTINGS_DEFAULTS.componentSystem,
  // Per-device ignores are deliberately not reset: the confirm copy promises
  // limits, notifications and monitoring, and each ignore is undone on its
  // own device card.
};

/**
 * Diagnostics Settings tab: per-component health monitoring on/off, tray
 * notifications for the health checks (master + per-category + cooldown), and
 * a reset to the preferences.diagnostics contract defaults, which also restores
 * the built-in temperature sensors. Every field round-trips
 * through useUiSettings (server is the source of truth, profile-scoped).
 */
export function SettingsTab() {
  const { t } = useTranslation();
  const { settings, update } = useUiSettings();
  const { push } = useToast();
  const alerts = useSensorAlerts(true);
  const [resetOpen, setResetOpen] = useState(false);

  const notificationsEnabled = settings.diagnosticsNotificationsEnabled;
  const cooldownOptions = durationOptions(t, COOLDOWN_OPTIONS_MINUTES).map(o => ({
    ...o,
    disabled: !notificationsEnabled,
  }));

  const doReset = () => {
    update(DEFAULT_PATCH);
    void alerts.resetBuiltIns().then(ok => { if (!ok) push({ title: t('diagnostics.alerts.saveFailed') }); });
    setResetOpen(false);
  };

  return (
    <>
      <SettingsSection
        title={t('diagnostics.settings.components.title')}
        description={t('diagnostics.settings.components.description')}
      >
        <SettingToggle
          label={t('benchmark.phase.gpu')}
          checked={settings.diagnosticsComponentGpu}
          onChange={v => update({ diagnosticsComponentGpu: v })}
        />
        <SettingToggle
          label={t('benchmark.phase.storage')}
          checked={settings.diagnosticsComponentStorage}
          onChange={v => update({ diagnosticsComponentStorage: v })}
        />
        <SettingToggle
          label={t('benchmark.phase.ram')}
          checked={settings.diagnosticsComponentRam}
          onChange={v => update({ diagnosticsComponentRam: v })}
        />
        <SettingToggle
          label={t('diagnostics.settings.components.fansPumps.label')}
          description={t('diagnostics.settings.components.fansPumps.description')}
          checked={settings.diagnosticsComponentCooling}
          onChange={v => update({ diagnosticsComponentCooling: v })}
        />
        <SettingToggle
          label={t('diagnostics.kind.system')}
          checked={settings.diagnosticsComponentSystem}
          onChange={v => update({ diagnosticsComponentSystem: v })}
        />
      </SettingsSection>

      <SettingsSection
        title={t('diagnostics.settings.notifications.title')}
        description={t('diagnostics.settings.notifications.description')}
      >
        <SettingToggle
          label={t('diagnostics.settings.notifications.enable.label')}
          description={t('diagnostics.settings.notifications.enable.description')}
          checked={notificationsEnabled}
          onChange={v => update({ diagnosticsNotificationsEnabled: v })}
        />
        <SettingToggle
          label={t('diagnostics.settings.notifications.storageHealth.label')}
          checked={settings.diagnosticsNotifyStorageHealth}
          disabled={!notificationsEnabled}
          onChange={v => update({ diagnosticsNotifyStorageHealth: v })}
        />
        <SettingToggle
          label={t('diagnostics.kind.cooling')}
          description={t('diagnostics.settings.notifications.cooling.description')}
          checked={settings.diagnosticsNotifyCooling}
          disabled={!notificationsEnabled}
          onChange={v => update({ diagnosticsNotifyCooling: v })}
        />
        <SettingToggle
          label={t('diagnostics.reason.memory.testFailed')}
          checked={settings.diagnosticsNotifyMemoryTest}
          disabled={!notificationsEnabled}
          onChange={v => update({ diagnosticsNotifyMemoryTest: v })}
        />
        <SettingToggle
          label={t('diagnostics.system.pnpProblems')}
          checked={settings.diagnosticsNotifySystemDevices}
          disabled={!notificationsEnabled}
          onChange={v => update({ diagnosticsNotifySystemDevices: v })}
        />
        <SettingToggle
          label={t('diagnostics.reason.gpu.thermalThrottle')}
          checked={settings.diagnosticsNotifyGpuThrottle}
          disabled={!notificationsEnabled}
          onChange={v => update({ diagnosticsNotifyGpuThrottle: v })}
        />
        <SettingRow
          label={t('diagnostics.settings.notifications.cooldown.label')}
          description={t('diagnostics.settings.notifications.cooldown.description')}
          disabled={!notificationsEnabled}
        >
          <ChipGroup
            ariaLabel={t('diagnostics.settings.notifications.cooldown.label')}
            activeKey={String(settings.diagnosticsNotificationCooldownMinutes)}
            onChange={key => update({ diagnosticsNotificationCooldownMinutes: Number(key) })}
            options={cooldownOptions}
          />
        </SettingRow>
      </SettingsSection>

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
