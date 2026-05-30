import { useEffect, useState } from 'react';
import { Button } from '../../common/Button/Button';
import { SettingRow, SettingToggle, SettingSelect } from '../../common/SettingRow/SettingRow';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { ScreenTimeDataControl } from '../ScreenTimeBrowse/ScreenTimeDataControl';
import { fetchService, postService } from '../../../api/service';
import { useFlashStatus } from '../../../hooks/useFlashStatus';
import { useTranslation } from '../../../lib/i18n';
import {
  LANGUAGE_FLAGS, LANGUAGE_LABELS, LANGUAGES,
  type Language, type NexusSettings,
} from '../../../lib/settings';
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
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [screenTimeOpen, setScreenTimeOpen] = useState(false);
  // Block shutdown while a firmware flash is running — stopping the service
  // mid-flash would strand the device in the DFU bootloader. (The service also
  // refuses /service/stop during a flash; this just reflects it in the UI.)
  const { status: flashStatus } = useFlashStatus(serviceOnline);
  const flashing = !!flashStatus?.active;

  // Hydrate "Start Nexus at system startup" from the SCM-backed endpoint on
  // mount. The state is independent of the per-user "Show in tray" flag.
  useEffect(() => {
    if (!serviceOnline || platform !== 'windows') return;
    let cancelled = false;
    // Hydrate auto-start flag from the service on mount/online-flip. Standard
    // async-load pattern; can't be folded into useMemo.
     
    setAutoStartLoading(true);
    fetchService<{ autoStart: boolean }>('/service/startup-mode').then(data => {
      if (data && !cancelled) setAutoStart(data.autoStart);
    }).finally(() => {
      if (!cancelled) setAutoStartLoading(false);
    });
    return () => { cancelled = true; };
  }, [serviceOnline, platform]);

  const toggleAutoStart = async () => {
    if (autoStart === null) return;
    setAutoStartLoading(true);
    const resp = await postService<{ autoStart: boolean }>('/service/startup-mode', {
      autoStart: !autoStart,
    });
    if (resp) setAutoStart(resp.autoStart);
    setAutoStartLoading(false);
  };

  const shutDown = async () => {
    setStopping(true);
    await postService('/service/stop', {});
    setStopConfirmOpen(false);
    setStopping(false);
    window.close();
  };

  return (
    <div className={styles.tabPanel}>
      <SettingSelect
        label={t('settings.language')}
        value={settings.general.language}
        options={LANGUAGES.map(l => ({ value: l, label: `${LANGUAGE_FLAGS[l]}  ${LANGUAGE_LABELS[l]}` }))}
        onChange={v => updateGeneral({ language: v as Language })}
      />

      {platform === 'windows' && autoStart !== null && (
        <SettingToggle
          label={t('settings.systemStartup.label')}
          description={t('settings.systemStartup.description')}
          checked={autoStart}
          onChange={toggleAutoStart}
          disabled={!serviceOnline || autoStartLoading}
        />
      )}

      <SettingToggle
        label={t('settings.alerts.label')}
        description={t('settings.alerts.description')}
        checked={settings.general.disableConflictAlerts}
        onChange={() => updateGeneral({ disableConflictAlerts: !settings.general.disableConflictAlerts })}
      />

      <SettingToggle
        label={t('settings.advancedWidgets.label')}
        description={t('settings.advancedWidgets.description')}
        checked={settings.general.widgetAdvancedMode}
        onChange={() => updateGeneral({ widgetAdvancedMode: !settings.general.widgetAdvancedMode })}
      />

      {platform === 'macos' && (
        <SettingToggle
          label={t('settings.macStatusBar.label')}
          description={t('settings.macStatusBar.description')}
          checked={settings.general.showMacStatusBarIcon}
          onChange={() => updateGeneral({ showMacStatusBarIcon: !settings.general.showMacStatusBarIcon })}
        />
      )}

      {platform === 'windows' && (
        <SettingToggle
          label={t('settings.windowsTray.label')}
          description={t('settings.windowsTray.description')}
          checked={settings.general.showWindowsTrayIcon}
          onChange={() => updateGeneral({ showWindowsTrayIcon: !settings.general.showWindowsTrayIcon })}
        />
      )}

      <SettingRow
        label={t('settings.screentime.title')}
        description={t('settings.screentime.trackingDesc')}
      >
        <Button
          type="button"
          tone="neutral"
          size="sm"
          onClick={() => setScreenTimeOpen(true)}
          disabled={!serviceOnline}
        >
          {t('settings.screentime.openButton')}
        </Button>
      </SettingRow>

      <SettingRow label={t('settings.feedback')}>
        <a
          className={styles.rowButton}
          href="https://github.com/nexusqos/nexus-service/issues"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('settings.feedback.report')}
        </a>
      </SettingRow>

      {platform === 'windows' && (
        <SettingRow
          label={t('settings.shutDown.label')}
          description={flashing ? t('settings.shutDown.flashBlocked') : t('settings.shutDown.description')}
        >
          <Button
            type="button"
            tone="danger"
            size="sm"
            onClick={() => setStopConfirmOpen(true)}
            disabled={!serviceOnline || stopping || flashing}
          >
            {t('settings.shutDown.button')}
          </Button>
        </SettingRow>
      )}

      <ConfirmModal
        open={stopConfirmOpen}
        title={t('settings.shutDown.confirmTitle')}
        message={t('settings.shutDown.confirmMessage')}
        confirmLabel={t('settings.shutDown.button')}
        destructive
        onConfirm={shutDown}
        onCancel={() => setStopConfirmOpen(false)}
      />

      <ScreenTimeDataControl
        open={screenTimeOpen}
        onClose={() => setScreenTimeOpen(false)}
        onChanged={() => { /* settings page doesn't need to refetch */ }}
      />
    </div>
  );
}

