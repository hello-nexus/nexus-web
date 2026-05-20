import { useEffect, useState } from 'react';
import { Button } from '../../common/Button/Button';
import { Toggle } from '../../common/Toggle/Toggle';
import { Select } from '../../common/Select/Select';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { ScreenTimeDataControl } from '../ScreenTimeBrowse/ScreenTimeDataControl';
import { fetchService, postService } from '../../../api/service';
import { useTranslation } from '../../../lib/i18n';
import {
  LANGUAGE_FLAGS, LANGUAGE_LABELS, LANGUAGES,
  type Language, type QosSettings,
} from '../../../lib/settings';
import styles from './SettingsView.module.scss';

export interface GeneralTabProps {
  settings: QosSettings;
  updateGeneral: (patch: Partial<QosSettings['general']>) => void;
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

  // Hydrate "Start Qos at system startup" from the SCM-backed endpoint on
  // mount. The state is independent of the per-user "Show in tray" flag.
  useEffect(() => {
    if (!serviceOnline || platform !== 'windows') return;
    let cancelled = false;
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
      <SelectRow
        label={t('settings.language')}
        value={settings.general.language}
        options={LANGUAGES.map(l => ({ value: l, label: `${LANGUAGE_FLAGS[l]}  ${LANGUAGE_LABELS[l]}` }))}
        onChange={v => updateGeneral({ language: v as Language })}
      />

      {platform === 'windows' && autoStart !== null && (
        <ToggleRow
          label={t('settings.systemStartup.label')}
          description={t('settings.systemStartup.description')}
          checked={autoStart}
          onChange={toggleAutoStart}
          disabled={!serviceOnline || autoStartLoading}
        />
      )}

      <ToggleRow
        label={t('settings.alerts.label')}
        description={t('settings.alerts.description')}
        checked={settings.general.disableConflictAlerts}
        onChange={() => updateGeneral({ disableConflictAlerts: !settings.general.disableConflictAlerts })}
      />

      {platform === 'macos' && (
        <ToggleRow
          label={t('settings.macStatusBar.label')}
          description={t('settings.macStatusBar.description')}
          checked={settings.general.showMacStatusBarIcon}
          onChange={() => updateGeneral({ showMacStatusBarIcon: !settings.general.showMacStatusBarIcon })}
        />
      )}

      {platform === 'windows' && (
        <ToggleRow
          label={t('settings.windowsTray.label')}
          description={t('settings.windowsTray.description')}
          checked={settings.general.showWindowsTrayIcon}
          onChange={() => updateGeneral({ showWindowsTrayIcon: !settings.general.showWindowsTrayIcon })}
        />
      )}

      <div className={styles.row}>
        <div className={styles.rowInfo}>
          <span className={styles.rowLabel}>{t('settings.screentime.title')}</span>
          <span className={styles.rowDesc}>{t('settings.screentime.trackingDesc')}</span>
        </div>
        <Button
          type="button"
          tone="neutral"
          size="sm"
          onClick={() => setScreenTimeOpen(true)}
          disabled={!serviceOnline}
        >
          {t('settings.screentime.openButton')}
        </Button>
      </div>

      <div className={styles.row}>
        <div className={styles.rowInfo}>
          <span className={styles.rowLabel}>{t('settings.feedback')}</span>
        </div>
        <a
          className={styles.rowButton}
          href="https://github.com/nexusqos/qos-service/issues"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('settings.feedback.report')}
        </a>
      </div>

      {platform === 'windows' && (
        <div className={styles.row}>
          <div className={styles.rowInfo}>
            <span className={styles.rowLabel}>{t('settings.shutDown.label')}</span>
            <span className={styles.rowDesc}>{t('settings.shutDown.description')}</span>
          </div>
          <Button
            type="button"
            tone="danger"
            size="sm"
            onClick={() => setStopConfirmOpen(true)}
            disabled={!serviceOnline || stopping}
          >
            {t('settings.shutDown.button')}
          </Button>
        </div>
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

function ToggleRow({ label, description, checked, onChange, disabled }: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <label className={`${styles.row} ${disabled ? styles.disabled : ''}`}>
      <div className={styles.rowInfo}>
        <span className={styles.rowLabel}>{label}</span>
        {description && <span className={styles.rowDesc}>{description}</span>}
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} ariaLabel={label} />
    </label>
  );
}

function SelectRow({ label, value, options, onChange }: {
  label?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className={styles.row}>
      {label && <span className={styles.rowLabel}>{label}</span>}
      <Select value={value} onChange={onChange} options={options} ariaLabel={label} />
    </div>
  );
}
