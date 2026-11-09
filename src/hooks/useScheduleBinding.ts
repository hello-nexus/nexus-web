import { useTranslation } from '../lib/i18n';
import { scheduledBrightness, scheduleOutlook } from '../lib/brightnessSchedule';
import { useUnitPrefs } from './useUiSettings';
import { hour12OptionFor } from '../lib/units';
import type { BrightnessScheduleBinding } from '../components/common/BrightnessScheduleButton/BrightnessScheduleButton';
import type { BrightnessScheduleState } from './useBrightnessSchedule';

/**
 * Binds one brightness control to the universal schedule: its follow switch,
 * the status line for the popover, and the schedule's own on/off and editor.
 *
 * A device is capped by the schedule (it wears the lower of its slider and the
 * schedule's level): `capsSlider` makes the status line's "Now" that minimum,
 * and `serviceCap` is the cap the service reports for it (null while it does
 * not follow; undefined from a service that does not say, which falls back to
 * the schedule's level computed here). Lighting shows the schedule's level.
 */
export function useScheduleBinding({ state, follows, onFollowsChange, onEdit, onOpen, capsSlider = false, serviceCap }: {
  state: BrightnessScheduleState;
  follows: boolean;
  onFollowsChange: (next: boolean) => void;
  onEdit: () => void;
  onOpen?: () => void;
  capsSlider?: boolean;
  serviceCap?: number | null;
}): BrightnessScheduleBinding {
  const { t } = useTranslation();
  const { timeFormat } = useUnitPrefs();
  const { schedule, sunPoints, current, save } = state;
  const scheduleOn = schedule?.enabled === true;
  const points = scheduleOn ? (sunPoints ?? schedule.points) : null;

  const statusAt = (minute: number, sliderValue: number | null): string | null => {
    if (!points) return null;
    const level = Math.round(scheduledBrightness(points, minute));
    const now = capsSlider && follows && sliderValue !== null ? Math.min(sliderValue, level) : level;
    const outlook = scheduleOutlook(points, minute);
    const clock = (m: number) => new Date(2000, 0, 1, Math.floor(m / 60) % 24, Math.floor(m % 60))
      .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: hour12OptionFor(timeFormat) });
    if (outlook.kind === 'steady') return t('lighting.schedule.status.steady', { level: now });
    if (outlook.kind === 'moving') {
      return t(outlook.rising ? 'lighting.schedule.status.rising' : 'lighting.schedule.status.falling',
        { level: now, time: clock(outlook.untilMinute) });
    }
    return t(outlook.rising ? 'lighting.schedule.status.risesAt' : 'lighting.schedule.status.fallsAt',
      { level: now, time: clock(outlook.startMinute) });
  };

  return {
    scheduleOn, follows, onFollowsChange, onEdit, onOpen, statusAt,
    capPercent: scheduleOn && follows && current !== null ? (serviceCap !== undefined ? serviceCap : current) : null,
    onTurnOn: () => { if (schedule) void save({ ...schedule, enabled: true }); },
  };
}
