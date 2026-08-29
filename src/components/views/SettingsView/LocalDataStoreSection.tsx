import { useEffect, useState } from 'react';
import { Film, Hourglass, LineChart, Trash2 } from 'lucide-react';
import { Button } from '../../common/Button/Button';
import { SettingRow } from '../../common/SettingRow/SettingRow';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { Toggle } from '../../common/Toggle/Toggle';
import { useToastSafe } from '../../common/Toast/Toast';
import { ClearDataModal, type ClearDataScope } from './ClearDataModal';
import { getTrackingStatus, setTrackingEnabled } from '../../../hooks/useScreenTimeBrowse';
import { getFpsTrackingStatus, setFpsTrackingEnabled } from '../../../api/fps';
import { useTranslation } from '../../../lib/i18n';
import styles from './LocalDataStoreSection.module.scss';

interface LocalDataStoreSectionProps {
  serviceOnline: boolean;
}

/**
 * Privacy & Data's "Local data store" section: the screen-time tracking
 * toggle, the FPS capture toggle, and the tracking-less monitoring history
 * graphs. Every toggle row carries a second "Clear data" line underneath,
 * which opens the shared ClearDataModal scoped to that row's data.
 */
export function LocalDataStoreSection({ serviceOnline }: LocalDataStoreSectionProps) {
  const { t } = useTranslation();
  const toast = useToastSafe();

  const [screenTimeOn, setScreenTimeOn] = useState<boolean | null>(null);
  const [fpsOn, setFpsOn] = useState<boolean | null>(null);
  const [togglingScreenTime, setTogglingScreenTime] = useState(false);
  const [togglingFps, setTogglingFps] = useState(false);
  const [clearScope, setClearScope] = useState<ClearDataScope | null>(null);

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

  const handleCleared = (count: number) => {
    setClearScope(null);
    toast.push({ title: t('settings.localDataStore.clearDataModal.done', { count }) });
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
        </SettingRow>
        <div className={styles.clearRow} data-settings-aside="true">
          <Button
            type="button"
            tone="danger"
            size="sm"
            icon={<Trash2 size={14} />}
            onClick={() => setClearScope('screenTime')}
            disabled={!serviceOnline}
          >
            {t('settings.localDataStore.clearButton')}
          </Button>
        </div>

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
        </SettingRow>
        <div className={styles.clearRow} data-settings-aside="true">
          <Button
            type="button"
            tone="danger"
            size="sm"
            icon={<Trash2 size={14} />}
            onClick={() => setClearScope('fps')}
            disabled={!serviceOnline}
          >
            {t('settings.localDataStore.clearButton')}
          </Button>
        </div>

        <SettingRow
          label={t('settings.localDataStore.monitoringHistory.label')}
          icon={<LineChart />}
          iconLeading="subtle"
          anchorId="set-monitoring-history-purge"
          description={t('settings.localDataStore.monitoringHistory.description')}
        />
        <div className={styles.clearRow} data-settings-aside="true">
          <Button
            type="button"
            tone="danger"
            size="sm"
            icon={<Trash2 size={14} />}
            onClick={() => setClearScope('monitoringHistory')}
            disabled={!serviceOnline}
          >
            {t('settings.localDataStore.clearButton')}
          </Button>
        </div>
      </SettingsSection>

      {clearScope !== null && (
        <ClearDataModal
          scope={clearScope}
          open
          onClose={() => setClearScope(null)}
          onCleared={handleCleared}
        />
      )}
    </>
  );
}
