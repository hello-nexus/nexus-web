import { useEffect, useState } from 'react';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingToggle, SettingSelect } from '../../common/SettingRow/SettingRow';
import { fetchAutoStart, setAutoStart as postAutoStart } from '../../../api/autoStart';
import { useTranslation } from '../../../lib/i18n';
import {
  LANGUAGE_FLAGS, LANGUAGE_LABELS, LANGUAGES,
  type Language, type NexusSettings,
} from '../../../lib/settings';
import type { UpdateChannel, UpdateMode } from '../../../api/update';
import friuliFlag from '../../../assets/flags/friuli.png';
import styles from './SettingsView.module.scss';

export interface GeneralTabProps {
  settings: NexusSettings;
  updateGeneral: (patch: Partial<NexusSettings['general']>) => void;
  serviceOnline: boolean;
  platform: string;
}

export function GeneralTab({ settings, updateGeneral, serviceOnline, platform }: GeneralTabProps) {
  const { t } = useTranslation();
  const [autoStart, setAutoStart] = useState<boolean | null>(null);
  const [autoStartLoading, setAutoStartLoading] = useState(false);

  // Hydrate "Start Nexus at system startup" from the SCM-backed endpoint on
  // mount. The state is independent of the per-user "Show in tray" flag.
  useEffect(() => {
    if (!serviceOnline || platform !== 'windows') return;
    let cancelled = false;
    // Runs on mount/online-flip; can't be folded into useMemo.

    setAutoStartLoading(true);
    fetchAutoStart().then(data => {
      if (data && !cancelled) setAutoStart(data.autoStart);
    }).finally(() => {
      if (!cancelled) setAutoStartLoading(false);
    });
    return () => { cancelled = true; };
  }, [serviceOnline, platform]);

  // Optimistic: flip the toggle immediately so the row never dims/disables
  // (and its text never flashes) for the loopback round trip - reconcile to
  // the server's echoed value on response, or roll back on failure.
  const toggleAutoStart = async () => {
    if (autoStart === null || autoStartLoading) return;
    const previous = autoStart;
    setAutoStart(!previous);
    setAutoStartLoading(true);
    const resp = await postAutoStart(!previous);
    setAutoStart(resp ? resp.autoStart : previous);
    setAutoStartLoading(false);
  };

  return (
    <div className={styles.tabPanel}>
      <SettingsSection>
        <SettingSelect
          label={t('settings.language')}
          anchorId="set-language"
          value={settings.general.language}
          options={LANGUAGES.map(l => ({
            value: l,
            label: LANGUAGE_LABELS[l],
            // Friûl has no flag emoji - render its flag from an image asset.
            icon: l === 'fur' ? <img src={friuliFlag} alt="" /> : LANGUAGE_FLAGS[l],
          }))}
          onChange={v => updateGeneral({ language: v as Language })}
        />
        <SettingToggle
          label={t('settings.alerts.label')}
          anchorId="set-alerts"
          description={t('settings.alerts.description')}
          checked={settings.general.showConflictAlerts}
          onChange={() => updateGeneral({ showConflictAlerts: !settings.general.showConflictAlerts })}
        />
      </SettingsSection>

      {(platform === 'windows' || platform === 'macos') && (
        <SettingsSection title={t('settings.startupTray.title')}>
          {platform === 'windows' && autoStart !== null && (
            <SettingToggle
              label={t('settings.systemStartup.label')}
              anchorId="set-startup"
              description={t('settings.systemStartup.description')}
              checked={autoStart}
              onChange={toggleAutoStart}
              disabled={!serviceOnline}
            />
          )}
          {platform === 'windows' && (
            <SettingToggle
              label={t('settings.windowsTray.label')}
              anchorId="set-tray"
              description={t('settings.windowsTray.description')}
              checked={settings.general.showWindowsTrayIcon}
              onChange={() => updateGeneral({ showWindowsTrayIcon: !settings.general.showWindowsTrayIcon })}
            />
          )}
          {platform === 'macos' && (
            <SettingToggle
              label={t('settings.macStatusBar.label')}
              anchorId="set-menubar"
              description={t('settings.macStatusBar.description')}
              checked={settings.general.showMacStatusBarIcon}
              onChange={() => updateGeneral({ showMacStatusBarIcon: !settings.general.showMacStatusBarIcon })}
            />
          )}
        </SettingsSection>
      )}

      {platform === 'windows' && (
        <SettingsSection title={t('settings.updates.title')}>
          <SettingSelect
            label={t('settings.updates.mode.label')}
            anchorId="set-update-mode"
            description={t('settings.updates.mode.description')}
            value={settings.general.updateMode ?? 'always'}
            options={[
              // eslint-disable-next-line i18next/no-literal-string -- update mode enum value
              { value: 'always', label: t('settings.updates.mode.always') },
              // eslint-disable-next-line i18next/no-literal-string -- update mode enum value
              { value: 'download', label: t('settings.updates.mode.download') },
              // eslint-disable-next-line i18next/no-literal-string -- update mode enum value
              { value: 'notify', label: t('settings.updates.mode.notify') },
            ]}
            onChange={v => updateGeneral({ updateMode: v as UpdateMode })}
          />
          <SettingSelect
            label={t('settings.updates.channel.label')}
            anchorId="set-update-channel"
            description={t('settings.updates.channel.description')}
            value={settings.general.updateChannel ?? 'production'}
            options={[
              // eslint-disable-next-line i18next/no-literal-string -- update channel enum value
              { value: 'production', label: t('settings.updates.channel.production') },
              // eslint-disable-next-line i18next/no-literal-string -- update channel enum value
              { value: 'beta', label: t('settings.updates.channel.beta') },
            ]}
            onChange={v => updateGeneral({ updateChannel: v as UpdateChannel })}
          />
        </SettingsSection>
      )}
    </div>
  );
}
