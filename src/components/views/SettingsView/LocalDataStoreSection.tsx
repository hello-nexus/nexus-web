import { useEffect, useState } from 'react';
import { Film, Hourglass, LineChart, Trash2 } from 'lucide-react';
import { Button } from '../../common/Button/Button';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { SettingRow } from '../../common/SettingRow/SettingRow';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { Toggle } from '../../common/Toggle/Toggle';
import { useToastSafe } from '../../common/Toast/Toast';
import { ScreenTimeDataControl } from '../ScreenTimeBrowse/ScreenTimeDataControl';
import {
  deleteScreenTimeAll,
  getTrackingStatus,
  setTrackingEnabled,
} from '../../../hooks/useScreenTimeBrowse';
import { deleteFpsAll, getFpsTrackingStatus, setFpsTrackingEnabled } from '../../../api/fps';
import { deleteMonitoringHistory } from '../../../api/monitoringHistory';
import { useTranslation } from '../../../lib/i18n';

type PurgeRow = 'screenTime' | 'fps' | 'monitoringHistory';

interface LocalDataStoreSectionProps {
  serviceOnline: boolean;
}

/**
 * Privacy & Data's "Local data store" section: the screen-time tracking
 * toggle, the FPS capture toggle, and a tracking-less purge for the
 * monitoring history graphs. Every row shares one shape - label, description,
 * an optional toggle, and a Purge button behind a ConfirmModal stating what
 * is deleted and that it cannot be undone.
 */
export function LocalDataStoreSection({ serviceOnline }: LocalDataStoreSectionProps) {
  const { t } = useTranslation();
  const toast = useToastSafe();

  const [screenTimeOn, setScreenTimeOn] = useState<boolean | null>(null);
  const [fpsOn, setFpsOn] = useState<boolean | null>(null);
  const [togglingScreenTime, setTogglingScreenTime] = useState(false);
  const [togglingFps, setTogglingFps] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState<PurgeRow | null>(null);
  const [purging, setPurging] = useState(false);

  useEffect(() => {
    if (!serviceOnline) return;
    let cancelled = false;
    getTrackingStatus().then(s => { if (!cancelled && s) setScreenTimeOn(s.enabled); });
    return () => { cancelled = true; };
  }, [serviceOnline]);

  useEffect(() => {
    if (!serviceOnline) return;
    let cancelled = false;
    getFpsTrackingStatus().then(s => { if (!cancelled && s) setFpsOn(s.enabled); });
    return () => { cancelled = true; };
  }, [serviceOnline]);

  const toggleScreenTime = async (next: boolean) => {
    if (togglingScreenTime) return;
    const previous = screenTimeOn;
    setTogglingScreenTime(true);
    setScreenTimeOn(next);
    const resp = await setTrackingEnabled(next);
    setScreenTimeOn(resp ? resp.enabled : previous);
    setTogglingScreenTime(false);
  };

  const toggleFps = async (next: boolean) => {
    if (togglingFps) return;
    const previous = fpsOn;
    setTogglingFps(true);
    setFpsOn(next);
    const resp = await setFpsTrackingEnabled(next);
    setFpsOn(resp ? resp.enabled : previous);
    setTogglingFps(false);
  };

  const confirmPurge = async () => {
    if (!purgeOpen || purging) return;
    setPurging(true);
    const result = purgeOpen === 'screenTime' ? await deleteScreenTimeAll()
      : purgeOpen === 'fps' ? await deleteFpsAll()
        : await deleteMonitoringHistory();
    setPurging(false);
    setPurgeOpen(null);
    toast.push({ title: t('settings.localDataStore.purgeDone', { count: result?.deleted ?? 0 }) });
  };

  return (
    <>
      <SettingsSection title={t('settings.localDataStore.title')}>
        <SettingRow
          label={t('settings.screentime.title')}
          icon={<Hourglass />}
          iconLeading="subtle"
          anchorId="set-screentime"
          description={t('settings.screentime.trackingDesc')}
        >
          {screenTimeOn !== null && (
            <Toggle
              checked={screenTimeOn}
              onChange={toggleScreenTime}
              disabled={!serviceOnline || togglingScreenTime}
              ariaLabel={t('settings.screentime.tracking')}
            />
          )}
          <Button type="button" tone="neutral" size="sm" onClick={() => setManageOpen(true)} disabled={!serviceOnline}>
            {t('settings.screentime.openButton')}
          </Button>
          <Button
            type="button"
            tone="danger"
            size="sm"
            icon={<Trash2 size={14} />}
            onClick={() => setPurgeOpen('screenTime')}
            disabled={!serviceOnline}
          >
            {t('settings.localDataStore.purgeButton')}
          </Button>
        </SettingRow>

        <SettingRow
          label={t('settings.localDataStore.fps.label')}
          icon={<Film />}
          iconLeading="subtle"
          anchorId="set-fps-tracking"
          description={t('settings.localDataStore.fps.description')}
        >
          {fpsOn !== null && (
            <Toggle
              checked={fpsOn}
              onChange={toggleFps}
              disabled={!serviceOnline || togglingFps}
              ariaLabel={t('settings.localDataStore.fps.label')}
            />
          )}
          <Button
            type="button"
            tone="danger"
            size="sm"
            icon={<Trash2 size={14} />}
            onClick={() => setPurgeOpen('fps')}
            disabled={!serviceOnline}
          >
            {t('settings.localDataStore.purgeButton')}
          </Button>
        </SettingRow>

        <SettingRow
          label={t('settings.localDataStore.monitoringHistory.label')}
          icon={<LineChart />}
          iconLeading="subtle"
          anchorId="set-monitoring-history-purge"
          description={t('settings.localDataStore.monitoringHistory.description')}
        >
          <Button
            type="button"
            tone="danger"
            size="sm"
            icon={<Trash2 size={14} />}
            onClick={() => setPurgeOpen('monitoringHistory')}
            disabled={!serviceOnline}
          >
            {t('settings.localDataStore.purgeButton')}
          </Button>
        </SettingRow>
      </SettingsSection>

      <ScreenTimeDataControl
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        onChanged={() => { /* the settings page doesn't need to refetch */ }}
      />

      <ConfirmModal
        open={purgeOpen === 'screenTime'}
        title={t('settings.localDataStore.screenTime.purgeConfirmTitle')}
        message={t('settings.localDataStore.screenTime.purgeConfirmMessage')}
        confirmLabel={t('settings.localDataStore.purgeButton')}
        confirmDisabled={purging}
        onConfirm={() => void confirmPurge()}
        onCancel={() => setPurgeOpen(null)}
      />
      <ConfirmModal
        open={purgeOpen === 'fps'}
        title={t('settings.localDataStore.fps.purgeConfirmTitle')}
        message={t('settings.localDataStore.fps.purgeConfirmMessage')}
        confirmLabel={t('settings.localDataStore.purgeButton')}
        confirmDisabled={purging}
        onConfirm={() => void confirmPurge()}
        onCancel={() => setPurgeOpen(null)}
      />
      <ConfirmModal
        open={purgeOpen === 'monitoringHistory'}
        title={t('settings.localDataStore.monitoringHistory.purgeConfirmTitle')}
        message={t('settings.localDataStore.monitoringHistory.purgeConfirmMessage')}
        confirmLabel={t('settings.localDataStore.purgeButton')}
        confirmDisabled={purging}
        onConfirm={() => void confirmPurge()}
        onCancel={() => setPurgeOpen(null)}
      />
    </>
  );
}
