import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchGlobalBrightness, setGlobalBrightness } from '../../../../api/lighting';
import { BrightnessScheduleButton, type BrightnessScheduleBinding } from '../../../../components/common/BrightnessScheduleButton/BrightnessScheduleButton';
import { Slider } from '../../../../components/common/Slider/Slider';
import { BrightnessScheduleModal } from '../../../../components/views/SettingsView/BrightnessScheduleModal';
import { useScheduleBinding } from '../../../../hooks/useScheduleBinding';
import { useBrightnessSchedule } from '../../../../hooks/useBrightnessSchedule';
import { useThrottle } from '../../../../hooks/cadence';
import { useTopicCallback } from '../../../../hooks/useMultiplexSocket';
import { useTranslation } from '../../../../lib/i18n';
import styles from '../LightingPage.module.scss';

/**
 * Master brightness slider at the top of the lighting page. Joins each
 * per-device brightness before colour reaches hardware: by default effective LED
 * brightness is `min(global, device / 100)`, so a device never renders
 * brighter than master; with the brightness multiplier on it is
 * `global * device / 100`. Stored 0..1 on the service side, surfaced
 * 0..100% in the UI.
 *
 * While the time-of-day schedule is on, its current level is a second cap on
 * top of the slider, shown the way the per-device slider shows this one: a
 * marker at the scheduled level and the fill past it dimmed when it is the
 * lower of the two. A sun button beside the label opens the brightness settings in
 * place, whether the schedule is on or off.
 *
 * Renders as a labelled stacked slider so it reads as the first control in the
 * effect dock's stack rather than a separate widget.
 */
export function GlobalBrightnessSlider({ serviceOnline }: { serviceOnline: boolean }) {
  const scheduleState = useBrightnessSchedule(serviceOnline);
  const scheduled = scheduleState.current;
  const [scheduleOpen, setScheduleOpen] = useState(false);
  // Preview only: the service has no per-lighting switch yet.
  const [lightingFollows, setLightingFollows] = useState(true);
  // Null until the first fetch resolves, to avoid flashing 100% on
  // mount when the persisted value is anything else.
  const [percent, setPercent] = useState<number | null>(null);
  const throttle = useThrottle();
  // Active-drag window. Mid-drag topic pushes (including the broadcast
  // from our own throttled POST) would refetch the persisted value and
  // snap the thumb back to the last-committed server value.
  const localEditUntilRef = useRef(0);

  const refresh = useCallback(() => {
    if (Date.now() < localEditUntilRef.current) return;
    fetchGlobalBrightness().then(data => {
      if (!data) return;
      setPercent(Math.round(Math.max(0, Math.min(1, data.value)) * 100));
    }).catch(() => { /* best-effort */ });
  }, []);

  useEffect(() => {
    if (!serviceOnline) return;
    refresh();
  }, [serviceOnline, refresh]);

  // Stay in sync if another client (or a profile load) mutates the global
  // brightness. Every /lighting/* mutation publishes a `lighting` frame.
  useTopicCallback('lighting', serviceOnline, refresh);

  const sendValue = useCallback((next: number) => {
    setGlobalBrightness(Math.max(0, Math.min(1, next / 100))).catch(() => { /* best-effort */ });
  }, []);

  const handleChange = useCallback((value: number) => {
    localEditUntilRef.current = Date.now() + 1500;
    setPercent(value);
    throttle(() => sendValue(value));
  }, [sendValue, throttle]);

  const handleCommit = useCallback((value: number) => {
    localEditUntilRef.current = Date.now() + 1500;
    sendValue(value);
  }, [sendValue]);

  const schedule = scheduleState.schedule;
  const binding = useScheduleBinding({
    state: scheduleState,
    follows: lightingFollows,
    onFollowsChange: setLightingFollows,
    onEdit: () => setScheduleOpen(true),
  });
  return (
    <>
      <GlobalBrightnessSliderView
        percent={percent}
        scheduled={scheduled}
        binding={schedule === null || !serviceOnline ? null : binding}
        follows={lightingFollows}
        onChange={handleChange}
        onCommit={handleCommit}
      />
      {scheduleOpen && (
        <BrightnessScheduleModal open onClose={() => setScheduleOpen(false)} state={scheduleState} />
      )}
    </>
  );
}

interface GlobalBrightnessSliderViewProps {
  /** Null until the persisted value is known. */
  percent: number | null;
  /** The schedule's level right now; null while it is off. */
  scheduled: number | null;
  /** Null until the schedule has loaded: the sun then stays out. */
  binding: BrightnessScheduleBinding | null;
  /** Whether lighting follows the schedule at all. */
  follows: boolean;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
}

/**
 * The master brightness row: stacked slider plus the shared sun button, whose
 * popover holds the lighting follow switch. The schedule only caps the slider
 * while it is on and lighting follows it.
 */
export function GlobalBrightnessSliderView({
  percent, scheduled, binding, follows, onChange, onCommit,
}: GlobalBrightnessSliderViewProps) {
  const { t } = useTranslation();
  if (percent === null) {
    // Reserve the row so the OpenRGB badge doesn't shift when the
    // slider hydrates.
    return <div className={styles.globalBrightnessSlider} aria-hidden />;
  }

  const applied = follows ? scheduled : null;
  const capping = applied !== null && applied < percent;

  return (
    <div className={styles.globalBrightnessSlider}>
      <Slider
        // eslint-disable-next-line i18next/no-literal-string -- slider layout enum
        orientation="stacked"
        editable
        trackFill
        label={t('lighting.settings.brightnessLabel')}
        ariaLabel={t('lighting.settings.brightnessLabel')}
        value={percent}
        min={0}
        max={100}
        step={1}
        fillCap={capping ? applied : undefined}
        marker={applied ?? undefined}
        labelAction={binding && <BrightnessScheduleButton binding={binding} />}
        onChange={onChange}
        onCommit={onCommit}
      />
    </div>
  );
}
