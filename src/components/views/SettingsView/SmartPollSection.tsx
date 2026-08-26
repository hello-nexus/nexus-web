import { useCallback, useEffect, useState } from 'react';
import { HardDrive } from 'lucide-react';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingSlider, SettingToggle } from '../../common/SettingRow/SettingRow';
import { useUiSettings } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import {
  defaultSecondsForMedia, fetchSmartPoll, SMART_POLL_CHOICES, SMART_POLL_NEVER,
  type SmartPollDrive,
} from '../../../api/smartPoll';

/**
 * Per-drive SMART read interval. Reading SMART is an ATA pass-through that
 * reloads a parked head on a rotational drive, so the cadence is the user's
 * call; throughput and free space are on separate paths and always live.
 */
export function SmartPollSection({ serviceOnline }: { serviceOnline: boolean }) {
  const { t } = useTranslation();
  const { settings, update } = useUiSettings();
  const [drives, setDrives] = useState<SmartPollDrive[]>([]);
  const perDrive = settings.smartPollPerDrive;

  useEffect(() => {
    if (!serviceOnline) return;
    let cancelled = false;
    void fetchSmartPoll()
      .then(res => { if (!cancelled && res) setDrives(res.drives); })
      .catch(() => { /* the section renders the default row alone */ });
    return () => { cancelled = true; };
  }, [serviceOnline]);

  const label = useCallback((seconds: number) => {
    if (seconds === SMART_POLL_NEVER) return t('settings.smartPoll.never');
    if (seconds >= 60) return t('settings.smartPoll.minutes', { count: Math.round(seconds / 60) });
    return t('settings.smartPoll.seconds', { count: seconds });
  }, [t]);

  const indexOf = (seconds: number) => {
    const i = SMART_POLL_CHOICES.indexOf(seconds);
    return i === -1 ? SMART_POLL_CHOICES.indexOf(30) : i;
  };

  const setDriveSeconds = (id: string, seconds: number) => {
    update({ smartPollSeconds: { ...settings.smartPollSeconds, [id]: seconds } });
    setDrives(list => list.map(d => (d.id === id ? { ...d, seconds, usesDefault: false } : d)));
  };

  // A drive with no saved value follows its media type, so an SSD is not held
  // back by a cadence that only a platter drive needs.
  const secondsFor = (drive: SmartPollDrive) =>
    settings.smartPollSeconds[drive.id] ?? defaultSecondsForMedia(drive.rotational);

  return (
    <SettingsSection
      title={t('settings.smartPoll.title')}
      description={t('settings.smartPoll.description')}
    >
      <SettingToggle
        label={t('settings.smartPoll.perDriveLabel')}
        checked={perDrive}
        onChange={v => update({ smartPollPerDrive: v })}
        disabled={!serviceOnline}
      />

      <SettingSlider
        label={t('settings.smartPoll.defaultLabel')}
        icon={<HardDrive />}
        iconLeading="subtle"
        anchorId="set-smart-poll-default"
        description={t('settings.smartPoll.defaultDescription')}
        ariaLabel={t('settings.smartPoll.defaultLabel')}
        min={0}
        max={SMART_POLL_CHOICES.length - 1}
        step={1}
        trackFill
        disabled={!serviceOnline || perDrive}
        value={indexOf(settings.smartPollDefaultSeconds)}
        formatValue={i => label(SMART_POLL_CHOICES[i])}
        onChange={i => update({ smartPollDefaultSeconds: SMART_POLL_CHOICES[i] })}
      />

      {drives.map(drive => (
        <SettingSlider
          key={drive.id}
          label={drive.name || drive.id}
          icon={<HardDrive />}
          iconLeading="subtle"
          description={drive.rotational === true
            ? t('settings.smartPoll.mediaHdd')
            : drive.rotational === false ? t('settings.smartPoll.mediaSsd') : undefined}
          ariaLabel={drive.name || drive.id}
            min={0}
          max={SMART_POLL_CHOICES.length - 1}
          step={1}
          trackFill
          disabled={!serviceOnline || !perDrive}
          value={indexOf(secondsFor(drive))}
          formatValue={i => label(SMART_POLL_CHOICES[i])}
          onChange={i => setDriveSeconds(drive.id, SMART_POLL_CHOICES[i])}
        />
      ))}
    </SettingsSection>
  );
}
