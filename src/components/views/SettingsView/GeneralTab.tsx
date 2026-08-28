import { useEffect, useState } from 'react';
import { Compass, Eraser, ExternalLink, FolderOpen, GitBranch, History, Languages, Megaphone, PanelBottom, Power, PowerOff, RefreshCw, ScrollText, SquareMenu, Timer, TriangleAlert } from 'lucide-react';
import { Button } from '../../common/Button/Button';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingToggle, SettingSelect, SettingSlider, SettingRow } from '../../common/SettingRow/SettingRow';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { fetchAutoStart, setAutoStart as postAutoStart } from '../../../api/autoStart';
import { postService } from '../../../api/service';
import { resetOnboarding } from '../../../api/onboarding';
import { useFlashStatus } from '../../../hooks/useFlashStatus';
import { useTranslation } from '../../../lib/i18n';
import {
  LANGUAGE_FLAGS, LANGUAGE_LABELS, LANGUAGES,
  type Language, type NexusSettings,
} from '../../../lib/settings';
import type { UpdateChannel, UpdateMode } from '../../../api/update';
import { OFFICIAL_BUILD } from '../../../lib/officialBuild';
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
  const [restartingOnboarding, setRestartingOnboarding] = useState(false);
  // Reloads rather than flipping local state: the gates are derived on mount,
  // so the sequence only replays from a fresh load.
  const handleRestartOnboarding = async () => {
    setRestartingOnboarding(true);
    const res = await resetOnboarding().catch(() => null);
    if (res) window.location.reload();
    else setRestartingOnboarding(false);
  };
  const [autoStart, setAutoStart] = useState<boolean | null>(null);
  const [autoStartLoading, setAutoStartLoading] = useState(false);
  // Local drag preview - only committed to useUiSettings (and so posted to the
  // server) once the user releases the slider or types a precise value.
  const [startupDelayPreview, setStartupDelayPreview] = useState<number | null>(null);
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  // Block shutdown while a firmware flash is running - stopping the service
  // mid-flash would strand the device in the DFU bootloader. (The service
  // also refuses /service/stop during a flash; this mirrors it in the UI.)
  const { status: flashStatus } = useFlashStatus(serviceOnline);
  const flashing = !!flashStatus?.active;

  // Hydrate "Start Nexus at system startup" from /service/startup-mode
  // (Windows SCM start type; Linux systemd unit enablement) on mount. The
  // state is independent of the per-user "Show in tray" flag.
  useEffect(() => {
    if (!serviceOnline || (platform !== 'windows' && platform !== 'linux')) return;
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

  const shutDown = async () => {
    setStopping(true);
    await postService('/service/stop', {});
    setStopConfirmOpen(false);
    setStopping(false);
    window.close();
  };

  // Wipe every Nexus data dir and restart the service from a clean slate. The
  // service spawns a detached finalizer, stops, gets wiped, then restarts - so
  // this window's connection drops; close it and let the user reopen on the
  // fresh install. Loopback-only endpoint.
  const factoryReset = async () => {
    setResetting(true);
    await postService('/service/factory-reset', {});
    setResetConfirmOpen(false);
    setResetting(false);
    window.close();
  };

  // Reveal the logs folder (nexus-service.log, plus desktop-host.log on Windows) in
  // the OS file manager so testers can grab them for a bug report. Loopback-only
  // endpoint - acts on the local machine.
  const openLogs = async () => {
    await postService('/diagnostics/open-logs', {});
  };

  return (
    <div className={styles.tabPanel}>
      <SettingsSection>
        <SettingSelect
          label={t('settings.language')}
          anchorId="set-language"
          icon={<Languages />}
          iconLeading="subtle"
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
          icon={<TriangleAlert />}
          iconLeading="subtle"
          description={t('settings.alerts.description')}
          checked={settings.general.showConflictAlerts}
          onChange={() => updateGeneral({ showConflictAlerts: !settings.general.showConflictAlerts })}
        />
      </SettingsSection>

      {(platform === 'windows' || platform === 'macos' || (platform === 'linux' && autoStart !== null)) && (
        <SettingsSection title={t('settings.startupTray.title')}>
          {(platform === 'windows' || platform === 'linux') && autoStart !== null && (
            <SettingToggle
              label={t('settings.systemStartup.label')}
              anchorId="set-startup"
              icon={<Power />}
              iconLeading="subtle"
              description={t('settings.systemStartup.description')}
              checked={autoStart}
              onChange={toggleAutoStart}
              disabled={!serviceOnline}
            />
          )}
          {platform === 'windows' && (
            <SettingSlider
              label={t('settings.startupDelay.label')}
              anchorId="set-startup-delay"
              icon={<Timer />}
              iconLeading="subtle"
              description={t('settings.startupDelay.description')}
              value={startupDelayPreview ?? settings.general.startupDelaySeconds}
              min={0}
              max={60}
              step={1}
              editable
              trackFill
              formatValue={v => t('diagnostics.duration.seconds', { s: v })}
              disabled={!serviceOnline || !autoStart}
              onChange={(v, commit) => {
                setStartupDelayPreview(v);
                if (commit) {
                  updateGeneral({ startupDelaySeconds: v });
                  setStartupDelayPreview(null);
                }
              }}
              onCommit={v => {
                updateGeneral({ startupDelaySeconds: v });
                setStartupDelayPreview(null);
              }}
            />
          )}
          {platform === 'windows' && (
            <SettingToggle
              label={t('settings.windowsTray.label')}
              icon={<PanelBottom />}
              iconLeading="subtle"
              anchorId="set-tray"
              description={t('settings.windowsTray.description')}
              checked={settings.general.showWindowsTrayIcon}
              onChange={() => updateGeneral({ showWindowsTrayIcon: !settings.general.showWindowsTrayIcon })}
            />
          )}
          {platform === 'macos' && (
            <SettingToggle
              label={t('settings.macStatusBar.label')}
              icon={<SquareMenu />}
              iconLeading="subtle"
              anchorId="set-menubar"
              description={t('settings.macStatusBar.description')}
              checked={settings.general.showMacStatusBarIcon}
              onChange={() => updateGeneral({ showMacStatusBarIcon: !settings.general.showMacStatusBarIcon })}
            />
          )}
          <SettingToggle
            label={t('settings.rememberLastPage.label')}
            icon={<History />}
            iconLeading="subtle"
            anchorId="set-remember-page"
            description={t('settings.rememberLastPage.description')}
            checked={settings.general.rememberLastPage}
            onChange={() => updateGeneral({ rememberLastPage: !settings.general.rememberLastPage })}
          />
        </SettingsSection>
      )}

      {/* OTA ships our signed releases. */}
      {platform === 'windows' && OFFICIAL_BUILD && (
        <SettingsSection title={t('settings.updates.title')}>
          <SettingSelect
            label={t('settings.updates.mode.label')}
            anchorId="set-update-mode"
            icon={<RefreshCw />}
            iconLeading="subtle"
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
            icon={<GitBranch />}
            iconLeading="subtle"
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

      <SettingsSection title={t('settings.diagnostics.title')}>
        <SettingRow
          label={t('settings.diagnostics.logsLabel')}
          icon={<ScrollText />}
          iconLeading="subtle"
          description={t('settings.diagnostics.logsDescription')}
        >
          <Button
            type="button"
            tone="neutral"
            size="sm"
            icon={<FolderOpen size={14} aria-hidden />}
            onClick={openLogs}
            disabled={!serviceOnline}
          >
            {t('settings.diagnostics.openLogsButton')}
          </Button>
        </SettingRow>

        <SettingRow
          label={t('settings.restartOnboarding')}
          description={t('settings.restartOnboarding.detail')}
          icon={<Compass />}
          iconLeading="subtle"
        >
          <Button tone="neutral" size="sm" loading={restartingOnboarding} onClick={handleRestartOnboarding}>
            {t('settings.restartOnboarding.action')}
          </Button>
        </SettingRow>

        <SettingRow label={t('settings.feedback')} icon={<Megaphone />} iconLeading="subtle">
          <Button
            tone="neutral"
            size="sm"
            iconTrailing={<ExternalLink size={14} aria-hidden />}
            href="https://github.com/hello-nexus/nexus-service/issues"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('settings.feedback.report')}
          </Button>
        </SettingRow>
      </SettingsSection>

      {/* eslint-disable-next-line i18next/no-literal-string -- CSS variable token */}
      <SettingsSection title={t('settings.dangerZone')} titleStyle={{ color: 'var(--bad)' }}>
        {(platform === 'windows' || platform === 'macos' || platform === 'linux') && (
          <SettingRow
            label={t('settings.shutDown.label')}
            anchorId="set-shutdown"
            icon={<PowerOff />}
            iconLeading="subtle"
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

        <SettingRow
          label={t('settings.factoryReset.label')}
          anchorId="set-factory-reset"
          icon={<Eraser />}
          iconLeading="subtle"
          description={flashing ? t('settings.factoryReset.flashBlocked') : t('settings.factoryReset.description')}
        >
          <Button
            type="button"
            tone="danger"
            size="sm"
            onClick={() => setResetConfirmOpen(true)}
            disabled={!serviceOnline || resetting || flashing}
          >
            {t('settings.factoryReset.button')}
          </Button>
        </SettingRow>
      </SettingsSection>

      <ConfirmModal
        open={stopConfirmOpen}
        title={t('settings.shutDown.confirmTitle')}
        message={t('settings.shutDown.confirmMessage')}
        confirmLabel={t('settings.shutDown.button')}
        destructive
        onConfirm={shutDown}
        onCancel={() => setStopConfirmOpen(false)}
      />

      <ConfirmModal
        open={resetConfirmOpen}
        title={t('settings.factoryReset.confirmTitle')}
        message={t('settings.factoryReset.confirmMessage')}
        bullets={t('settings.factoryReset.wipeList').split('\n')}
        note={t('settings.factoryReset.confirmNote')}
        // eslint-disable-next-line i18next/no-literal-string -- note tone enum value
        noteTone="danger"
        confirmLabel={t('settings.factoryReset.confirmButton')}
        destructive
        onConfirm={factoryReset}
        onCancel={() => setResetConfirmOpen(false)}
      />
    </div>
  );
}
