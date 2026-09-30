import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import { fetchGlobalBrightness, setGlobalBrightness } from '../../../../api/lighting';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import { Slider } from '../../../../components/common/Slider/Slider';
import { BrightnessScheduleModal } from '../../../../components/views/SettingsView/BrightnessScheduleModal';
import { useBrightnessSchedule } from '../../../../hooks/useBrightnessSchedule';
import { useThrottle } from '../../../../hooks/cadence';
import { useTopicCallback } from '../../../../hooks/useMultiplexSocket';
import { useTranslation } from '../../../../lib/i18n';
import styles from '../LightingPage.module.scss';

/**
 * Master brightness slider at the top of the lighting page. Caps each
 * per-device brightness before colour reaches hardware: effective LED
 * brightness is `min(global, device / 100)`, so a device never renders
 * brighter than master. Stored 0..1 on the service side, surfaced
 * 0..100% in the UI.
 *
 * While the time-of-day schedule is on, its current level is a second cap on
 * top of the slider, shown the way the per-device slider shows this one: a
 * marker at the scheduled level and the fill past it dimmed when it is the
 * lower of the two. A clock beside the label opens the schedule editor in
 * place, whether the schedule is on or off.
 *
 * Renders as a labelled stacked slider so it reads as the first control in the
 * effect dock's stack rather than a separate widget.
 */
export function GlobalBrightnessSlider({ serviceOnline }: { serviceOnline: boolean }) {
  const { t } = useTranslation();
  const scheduleState = useBrightnessSchedule(serviceOnline);
  const scheduled = scheduleState.current;
  const [scheduleOpen, setScheduleOpen] = useState(false);
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

  if (percent === null) {
    // Reserve the row so the OpenRGB badge doesn't shift when the
    // slider hydrates.
    return <div className={styles.globalBrightnessSlider} aria-hidden />;
  }

  const capping = scheduled !== null && scheduled < percent;
  const scheduleLoaded = scheduleState.schedule !== null;
  const canOpenSchedule = serviceOnline && scheduleLoaded;
  const openSchedule = () => { if (canOpenSchedule) setScheduleOpen(true); };
  // Until the schedule loads, only its name: on or off is not known yet.
  const scheduleStatus = !scheduleLoaded ? undefined
    : scheduled === null ? t('lighting.schedule.now.off')
      : capping ? t('lighting.schedule.marker.capping', { level: scheduled })
        : t('lighting.schedule.marker.allowing', { level: scheduled });
  // A span with the button role, not a <button>: the stacked Slider is a
  // <label>, whose control is its first labelable descendant. A real button
  // here would sit before the range input and take both the label's clicks
  // and its accessible name.
  const scheduleMarker = (
    <HoverTooltip
      title={scheduleStatus !== undefined ? t('lighting.schedule.marker.title') : undefined}
      body={scheduleStatus ?? t('lighting.schedule.marker.title')}
      side="top"
    >
      <span
        role="button"
        tabIndex={canOpenSchedule ? 0 : -1}
        className={styles.scheduleMarker}
        data-active={scheduled !== null ? '' : undefined}
        aria-label={t('lighting.schedule.marker.title')}
        aria-disabled={canOpenSchedule ? undefined : true}
        // A mouse press must not focus the clock: the modal hands focus back
        // to it on close, and that focus reopens the tooltip.
        onMouseDown={e => e.preventDefault()}
        onClick={e => { e.preventDefault(); openSchedule(); }}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSchedule(); } }}
      >
        <Clock size={14} />
      </span>
    </HoverTooltip>
  );

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
        fillCap={capping ? scheduled : undefined}
        marker={scheduled ?? undefined}
        labelAction={scheduleMarker}
        onChange={handleChange}
        onCommit={handleCommit}
      />
      {scheduleOpen && (
        <BrightnessScheduleModal open onClose={() => setScheduleOpen(false)} state={scheduleState} />
      )}
    </div>
  );
}
