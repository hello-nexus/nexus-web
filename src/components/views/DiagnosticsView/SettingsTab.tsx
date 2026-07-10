import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { DIAGNOSTICS_SETTINGS_DEFAULTS, useUiSettings, type UiSettingsValue } from '../../../hooks/useUiSettings';
import { Button } from '../../common/Button/Button';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { ChipGroup, type ChipOption } from '../../common/ChipGroup/ChipGroup';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingRow, SettingToggle, SettingSlider } from '../../common/SettingRow/SettingRow';

// 0 = "clears immediately"; the rest step through the shared minutes/hours
// duration templates (diagnostics.duration.minutes / .hours).
const LINGER_OPTIONS_MINUTES = [0, 30, 60, 360, 1440] as const;
const COOLDOWN_OPTIONS_MINUTES = [15, 30, 60, 120, 360, 1440] as const;

type Translate = (key: string, params?: Record<string, string | number>) => string;

function formatDurationMinutes(t: Translate, minutes: number): string {
  if (minutes === 0) return t('diagnostics.settings.linger.immediate');
  if (minutes < 60) return t('diagnostics.duration.minutes', { m: minutes });
  return t('diagnostics.duration.hours', { h: minutes / 60 });
}

function durationOptions(t: Translate, minuteValues: readonly number[]): ChipOption[] {
  return minuteValues.map(minutes => ({ key: String(minutes), label: formatDurationMinutes(t, minutes) }));
}

const DEFAULT_PATCH: Partial<UiSettingsValue> = {
  diagnosticsCpuTempC: DIAGNOSTICS_SETTINGS_DEFAULTS.cpuTempC,
  diagnosticsGpuTempC: DIAGNOSTICS_SETTINGS_DEFAULTS.gpuTempC,
  diagnosticsStorageTempC: DIAGNOSTICS_SETTINGS_DEFAULTS.storageTempC,
  diagnosticsRamTempC: DIAGNOSTICS_SETTINGS_DEFAULTS.ramTempC,
  diagnosticsWarningLingerMinutes: DIAGNOSTICS_SETTINGS_DEFAULTS.warningLingerMinutes,
  diagnosticsNotificationsEnabled: DIAGNOSTICS_SETTINGS_DEFAULTS.notificationsEnabled,
  diagnosticsNotifyHighTemp: DIAGNOSTICS_SETTINGS_DEFAULTS.notifyHighTemp,
  diagnosticsNotifyStorageHealth: DIAGNOSTICS_SETTINGS_DEFAULTS.notifyStorageHealth,
  diagnosticsNotifyCooling: DIAGNOSTICS_SETTINGS_DEFAULTS.notifyCooling,
  diagnosticsNotifyMemoryTest: DIAGNOSTICS_SETTINGS_DEFAULTS.notifyMemoryTest,
  diagnosticsNotifySystemDevices: DIAGNOSTICS_SETTINGS_DEFAULTS.notifySystemDevices,
  diagnosticsNotifyGpuThrottle: DIAGNOSTICS_SETTINGS_DEFAULTS.notifyGpuThrottle,
  diagnosticsNotificationCooldownMinutes: DIAGNOSTICS_SETTINGS_DEFAULTS.notificationCooldownMinutes,
  diagnosticsComponentCpu: DIAGNOSTICS_SETTINGS_DEFAULTS.componentCpu,
  diagnosticsComponentGpu: DIAGNOSTICS_SETTINGS_DEFAULTS.componentGpu,
  diagnosticsComponentStorage: DIAGNOSTICS_SETTINGS_DEFAULTS.componentStorage,
  diagnosticsComponentRam: DIAGNOSTICS_SETTINGS_DEFAULTS.componentRam,
  diagnosticsComponentCooling: DIAGNOSTICS_SETTINGS_DEFAULTS.componentCooling,
  diagnosticsComponentSystem: DIAGNOSTICS_SETTINGS_DEFAULTS.componentSystem,
};

/**
 * Diagnostics Settings tab: per-component max temperatures, how long a
 * temperature warning lingers after cooling down, tray notifications (master
 * + per-category + cooldown), per-component monitoring on/off, and a reset
 * to the preferences.diagnostics contract defaults. Every field round-trips
 * through useUiSettings (server is the source of truth, profile-scoped).
 */
export function SettingsTab() {
  const { t } = useTranslation();
  const { settings, update } = useUiSettings();
  const [resetOpen, setResetOpen] = useState(false);

  const notificationsEnabled = settings.diagnosticsNotificationsEnabled;
  const lingerOptions = durationOptions(t, LINGER_OPTIONS_MINUTES);
  const cooldownOptions = durationOptions(t, COOLDOWN_OPTIONS_MINUTES).map(o => ({
    ...o,
    disabled: !notificationsEnabled,
  }));

  const doReset = () => {
    update(DEFAULT_PATCH);
    setResetOpen(false);
  };

  return (
    <>
      <SettingsSection
        title={t('diagnostics.settings.thresholds.title')}
        description={t('diagnostics.settings.thresholds.description')}
      >
        <SettingSlider
          label={t('benchmark.phase.cpu')}
          value={settings.diagnosticsCpuTempC} min={60} max={105}
          editable trackFill
          formatValue={v => `${v}°C`}
          onChange={v => update({ diagnosticsCpuTempC: v })}
        />
        <SettingSlider
          label={t('benchmark.phase.gpu')}
          value={settings.diagnosticsGpuTempC} min={60} max={105}
          editable trackFill
          formatValue={v => `${v}°C`}
          onChange={v => update({ diagnosticsGpuTempC: v })}
        />
        <SettingSlider
          label={t('benchmark.phase.storage')}
          value={settings.diagnosticsStorageTempC} min={40} max={90}
          editable trackFill
          formatValue={v => `${v}°C`}
          onChange={v => update({ diagnosticsStorageTempC: v })}
        />
        <SettingSlider
          label={t('benchmark.phase.ram')}
          value={settings.diagnosticsRamTempC} min={40} max={90}
          editable trackFill
          formatValue={v => `${v}°C`}
          onChange={v => update({ diagnosticsRamTempC: v })}
        />
      </SettingsSection>

      <SettingsSection
        title={t('diagnostics.settings.linger.title')}
        description={t('diagnostics.settings.linger.description')}
      >
        <SettingRow label={t('diagnostics.settings.linger.rowLabel')}>
          <ChipGroup
            ariaLabel={t('diagnostics.settings.linger.rowLabel')}
            activeKey={String(settings.diagnosticsWarningLingerMinutes)}
            onChange={key => update({ diagnosticsWarningLingerMinutes: Number(key) })}
            options={lingerOptions}
          />
        </SettingRow>
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
          label={t('diagnostics.settings.notifications.highTemp.label')}
          checked={settings.diagnosticsNotifyHighTemp}
          disabled={!notificationsEnabled}
          onChange={v => update({ diagnosticsNotifyHighTemp: v })}
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

      <SettingsSection
        title={t('diagnostics.settings.components.title')}
        description={t('diagnostics.settings.components.description')}
      >
        <SettingToggle
          label={t('benchmark.phase.cpu')}
          checked={settings.diagnosticsComponentCpu}
          onChange={v => update({ diagnosticsComponentCpu: v })}
        />
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
          label={t('diagnostics.kind.cooling')}
          checked={settings.diagnosticsComponentCooling}
          onChange={v => update({ diagnosticsComponentCooling: v })}
        />
        <SettingToggle
          label={t('diagnostics.kind.system')}
          checked={settings.diagnosticsComponentSystem}
          onChange={v => update({ diagnosticsComponentSystem: v })}
        />
      </SettingsSection>

      <SettingsSection>
        <SettingRow
          label={t('diagnostics.settings.reset.label')}
          description={t('diagnostics.settings.reset.description')}
        >
          <Button type="button" tone="neutral" size="sm" icon={<RotateCcw size={13} />} onClick={() => setResetOpen(true)}>
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
