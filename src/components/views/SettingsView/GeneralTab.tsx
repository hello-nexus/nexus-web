import { useEffect, useState } from 'react';
import { Button } from '../../common/Button/Button';
import { SectionHeader } from '../../common/SectionHeader/SectionHeader';
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
  // Telemetry consent is server-authoritative (the service gates sending), so
  // it's fetched/written directly like auto-start, not via the local UI store.
  const [telemetryOn, setTelemetryOn] = useState<boolean | null>(null);
  const [telemetryLoading, setTelemetryLoading] = useState(false);
  // Block shutdown while a firmware flash is running — stopping the service
  // mid-flash would strand the device in the DFU bootloader. (The service
  // also refuses /service/stop during a flash; this mirrors it in the UI.)
  const { status: flashStatus } = useFlashStatus(serviceOnline);
  const flashing = !!flashStatus?.active;

  // Hydrate "Start Nexus at system startup" from the SCM-backed endpoint on
  // mount. The state is independent of the per-user "Show in tray" flag.
  useEffect(() => {
    if (!serviceOnline || platform !== 'windows') return;
    let cancelled = false;
    // Runs on mount/online-flip; can't be folded into useMemo.
     
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

  // Hydrate the telemetry opt-in from the loopback-only consent endpoint. Stays
  // null (toggle hidden) on surfaces that can't reach it, e.g. a paired phone.
  useEffect(() => {
    if (!serviceOnline) return;
    let cancelled = false;
    fetchService<{ enabled: boolean }>('/telemetry/consent').then(data => {
      if (data && !cancelled) setTelemetryOn(data.enabled);
    });
    return () => { cancelled = true; };
  }, [serviceOnline]);

  const toggleTelemetry = async () => {
    if (telemetryOn === null) return;
    setTelemetryLoading(true);
    const resp = await postService<{ enabled: boolean }>('/telemetry/consent', {
      enabled: !telemetryOn,
    });
    if (resp) setTelemetryOn(resp.enabled);
    setTelemetryLoading(false);
  };

  const shutDown = async () => {
    setStopping(true);
    await postService('/service/stop', {});
    setStopConfirmOpen(false);
    setStopping(false);
    window.close();
  };

  // Reveal the logs folder (service.log, plus desktop-host.log on Windows) in
  // the OS file manager so testers can grab them for a bug report. Loopback-only
  // endpoint — acts on the local machine.
  const openLogs = async () => {
    await postService('/diagnostics/open-logs', {});
  };

  return (
    <div className={styles.tabPanel}>
      <div className={styles.settingsGroup}>
        <SectionHeader>General</SectionHeader>
        <SettingSelect
          label={t('settings.language')}
          value={settings.general.language}
          options={LANGUAGES.map(l => ({ value: l, label: `${LANGUAGE_FLAGS[l]}  ${LANGUAGE_LABELS[l]}` }))}
          onChange={v => updateGeneral({ language: v as Language })}
        />
        <SettingToggle
          label={t('settings.alerts.label')}
          description={t('settings.alerts.description')}
          checked={settings.general.disableConflictAlerts}
          onChange={() => updateGeneral({ disableConflictAlerts: !settings.general.disableConflictAlerts })}
        />
      </div>

      {(platform === 'windows' || platform === 'macos') && (
        <div className={styles.settingsGroup}>
          <SectionHeader>Startup &amp; tray</SectionHeader>
          {platform === 'windows' && autoStart !== null && (
            <SettingToggle
              label={t('settings.systemStartup.label')}
              description={t('settings.systemStartup.description')}
              checked={autoStart}
              onChange={toggleAutoStart}
              disabled={!serviceOnline || autoStartLoading}
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
          {platform === 'macos' && (
            <SettingToggle
              label={t('settings.macStatusBar.label')}
              description={t('settings.macStatusBar.description')}
              checked={settings.general.showMacStatusBarIcon}
              onChange={() => updateGeneral({ showMacStatusBarIcon: !settings.general.showMacStatusBarIcon })}
            />
          )}
        </div>
      )}

      <div className={styles.settingsGroup}>
        <SectionHeader>Privacy</SectionHeader>
        {telemetryOn !== null && (
          <SettingToggle
            label="Share anonymous usage data"
            description="Helps us make Nexus better. Always anonymous and encrypted."
            checked={telemetryOn}
            onChange={toggleTelemetry}
            disabled={!serviceOnline || telemetryLoading}
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
      </div>

      <div className={styles.settingsGroup}>
        <SectionHeader>Diagnostics &amp; support</SectionHeader>
        <SettingRow
          label="Logs"
          description="Open the folder with Nexus log files to share for diagnostics"
        >
          <Button
            type="button"
            tone="neutral"
            size="sm"
            onClick={openLogs}
            disabled={!serviceOnline}
          >
            Open logs folder
          </Button>
        </SettingRow>

        <SettingRow label={t('settings.feedback')}>
          <a
            className={styles.rowButton}
            href="https://github.com/hello-nexus/nexus-service/issues"
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
      </div>

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

