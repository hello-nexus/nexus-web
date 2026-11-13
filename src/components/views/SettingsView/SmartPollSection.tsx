import { useCallback, useEffect, useRef, useState } from 'react';
import { HardDrive } from 'lucide-react';
import { Spinner } from '../../common/Spinner/Spinner';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingSlider } from '../../common/SettingRow/SettingRow';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import { useUiSettings } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { fetchSmartPoll, SMART_POLL_CHOICES, type SmartPollDrive } from '../../../api/smartPoll';
import { setDefaultInterval, smartPollIntervalLabel } from '../DiagnosticsView/smartPollHelpers';

const SMART_POLL_ANCHORS = ['set-smart-poll-default'] as const;

/**
 * Shared SMART read interval; a drive overrides it on Diagnostics > Storage. Reading SMART is an ATA pass-through that
 * reloads a parked head on a rotational drive, so the cadence is the user's
 * call; throughput and free space are on separate paths and always live.
 */
export function SmartPollSection({ serviceOnline }: { serviceOnline: boolean }) {
  const { t } = useTranslation();
  const { settings, update } = useUiSettings();
  const [drives, setDrives] = useState<SmartPollDrive[]>([]);
  const [serviceActive, setServiceActive] = useState<boolean | undefined>(undefined);
  // False until the first answer, so neither the rows nor the notice show for a moment and then swap.
  const [fetched, setFetched] = useState(false);
  // An older service omits the flag and always polls, so the section stays.
  const active = serviceActive !== false;
  const awaitingFirstRead = !!serviceOnline && !fetched;

  // Only the latest read may land: a topic ping can start one while another is in flight.
  const cancelPrevious = useRef<() => void>(() => {});
  const load = useCallback(() => {
    cancelPrevious.current();
    if (!serviceOnline) return () => {};
    let cancelled = false;
    void fetchSmartPoll()
      .then(res => { if (!cancelled && res) { setDrives(res.drives); setServiceActive(res.active); } })
      .catch(() => { /* the section renders the default row alone */ })
      .finally(() => { if (!cancelled) setFetched(true); });
    cancelPrevious.current = () => { cancelled = true; };
    return cancelPrevious.current;
  }, [serviceOnline]);

  useEffect(() => load(), [load]);
  // The service recomputes the flag after a preferences write and announces it on the preferences topic.
  useTopicCallback('prefs', serviceOnline, load);
  // The service pings this when the flag flips on its own (a live consumer connecting, a curve using a drive).
  useTopicCallback('smart-poll', serviceOnline, load);

  const label = useCallback((seconds: number) => smartPollIntervalLabel(t, seconds), [t]);

  const indexOf = (seconds: number) => {
    const i = SMART_POLL_CHOICES.indexOf(seconds);
    return i === -1 ? SMART_POLL_CHOICES.indexOf(30) : i;
  };

  // Drives set apart on Diagnostics > Storage keep their own interval; the rest follow the new default.
  const setDefaultSeconds = (seconds: number) => {
    const patch = setDefaultInterval(
      { seconds: settings.smartPollSeconds, defaultSeconds: settings.smartPollDefaultSeconds, perDrive: settings.smartPollPerDrive },
      drives,
      seconds,
    );
    update(patch);
  };

  return (
    <SettingsSection
      title={t('settings.smartPoll.title')}
      description={t('settings.smartPoll.description')}
      pillarOff={active || awaitingFirstRead ? undefined : { message: t('settings.pillarOff.smartPoll'), anchors: SMART_POLL_ANCHORS }}
    >
      {awaitingFirstRead ? <div data-settings-aside><Spinner size={20} /></div> : <>
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
        disabled={!serviceOnline}
        value={indexOf(settings.smartPollDefaultSeconds)}
        formatValue={i => label(SMART_POLL_CHOICES[i])}
        onChange={i => setDefaultSeconds(SMART_POLL_CHOICES[i])}
      />

      </>}
    </SettingsSection>
  );
}
