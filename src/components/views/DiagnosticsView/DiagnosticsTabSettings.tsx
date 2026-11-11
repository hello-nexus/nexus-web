import { useTranslation } from '../../../lib/i18n';
import { useUiSettings, type UiSettingsValue } from '../../../hooks/useUiSettings';
import { Card } from '../../common/Card/Card';
import { SettingToggle } from '../../common/SettingRow/SettingRow';
import type { DiagnosticsKind } from '../../../api/diagnostics';
import styles from './DiagnosticsView.module.scss';

type BoolKey = {
  [K in keyof UiSettingsValue]: UiSettingsValue[K] extends boolean ? K : never;
}[keyof UiSettingsValue];

interface ToggleSpec {
  labelKey: string;
  setting: BoolKey;
  /** A check notification: follows the health-check notifications master in Settings. */
  notify?: boolean;
}

/** Which monitoring and notification switches each tab carries, beside the data they govern. */
export const TAB_TOGGLES: Partial<Record<DiagnosticsKind, readonly ToggleSpec[]>> = {
  storage: [
    { labelKey: 'diagnostics.monitorComponent.storage', setting: 'diagnosticsComponentStorage' },
    { labelKey: 'diagnostics.notify.storage', setting: 'diagnosticsNotifyStorageHealth', notify: true },
  ],
  memory: [
    { labelKey: 'diagnostics.monitorComponent.ram', setting: 'diagnosticsComponentRam' },
    { labelKey: 'diagnostics.notify.memoryTest', setting: 'diagnosticsNotifyMemoryTest', notify: true },
  ],
  cooling: [
    { labelKey: 'diagnostics.monitorComponent.cooling', setting: 'diagnosticsComponentCooling' },
    { labelKey: 'diagnostics.notify.cooling', setting: 'diagnosticsNotifyCooling', notify: true },
  ],
  system: [
    { labelKey: 'diagnostics.monitorComponent.gpu', setting: 'diagnosticsComponentGpu' },
    { labelKey: 'diagnostics.monitorComponent.system', setting: 'diagnosticsComponentSystem' },
    { labelKey: 'diagnostics.notify.systemDevices', setting: 'diagnosticsNotifySystemDevices', notify: true },
    { labelKey: 'diagnostics.notify.gpuThrottle', setting: 'diagnosticsNotifyGpuThrottle', notify: true },
  ],
};

/** The on/off switches at the top of a diagnostics tab: monitoring of the tab's components and notifications for its checks. */
export function DiagnosticsTabSettings({ tab }: { tab: string }) {
  const { t } = useTranslation();
  const { settings, update } = useUiSettings();
  const specs = TAB_TOGGLES[tab as DiagnosticsKind];
  if (!specs) return null;
  const masterOn = settings.diagnosticsNotificationsEnabled;
  return (
    <Card compact className={styles.tabSettings}>
      {specs.map(spec => {
        const blocked = Boolean(spec.notify) && !masterOn;
        return (
          <SettingToggle
            key={spec.setting}
            label={t(spec.labelKey)}
            description={blocked ? t('diagnostics.notify.masterOff') : undefined}
            checked={settings[spec.setting]}
            disabled={blocked}
            onChange={v => update({ [spec.setting]: v })}
          />
        );
      })}
    </Card>
  );
}
