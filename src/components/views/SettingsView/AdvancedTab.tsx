import { useState } from 'react';
import { Button } from '../../common/Button/Button';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingRow } from '../../common/SettingRow/SettingRow';
import { AiIntegrationSection } from './AiIntegrationSection';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { postService } from '../../../api/service';
import { useFlashStatus } from '../../../hooks/useFlashStatus';
import { useTranslation } from '../../../lib/i18n';
import type { NexusSettings } from '../../../lib/settings';
import styles from './SettingsView.module.scss';

export interface AdvancedTabProps {
  settings: NexusSettings;
  serviceOnline: boolean;
  platform: string;
}

export function AdvancedTab({ settings, serviceOnline, platform }: AdvancedTabProps) {
  const { t } = useTranslation();
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  // Block shutdown while a firmware flash is running - stopping the service
  // mid-flash would strand the device in the DFU bootloader. (The service
  // also refuses /service/stop during a flash; this mirrors it in the UI.)
  const { status: flashStatus } = useFlashStatus(serviceOnline);
  const flashing = !!flashStatus?.active;

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
      <AiIntegrationSection serviceOnline={serviceOnline} numberFormat={settings.general.numberFormat} />

      <SettingsSection title={t('settings.diagnostics.title')}>
        <SettingRow
          label={t('settings.diagnostics.logsLabel')}
          description={t('settings.diagnostics.logsDescription')}
        >
          <Button
            type="button"
            tone="neutral"
            size="sm"
            onClick={openLogs}
            disabled={!serviceOnline}
          >
            {t('settings.diagnostics.openLogsButton')}
          </Button>
        </SettingRow>

        <SettingRow label={t('settings.feedback')}>
          <Button
            tone="neutral"
            size="sm"
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
        {(platform === 'windows' || platform === 'macos') && (
          <SettingRow
            label={t('settings.shutDown.label')}
            anchorId="set-shutdown"
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
