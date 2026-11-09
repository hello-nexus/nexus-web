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
 * schedule's level): `capsSlider` makes the status line's "Now" that minimum.
 * The cap marker is the schedule's level from the local curve, which the
 * schedule hook re-evaluates each minute; the service never broadcasts while the
 * curve drifts, so its own reading would go stale. Lighting shows the level too.
 */
export function useScheduleBinding({ state, follows, onFollowsChange, onEdit, onOpen, capsSlider = false }: {
  state: BrightnessScheduleState;
  follows: boolean;
  onFollowsChange: (next: boolean) => void;
  onEdit: () => void;
  onOpen?: () => void;
  capsSlider?: boolean;
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
    capPercent: scheduleOn && follows && current !== null ? current : null,
    onTurnOn: () => { if (schedule) void save({ ...schedule, enabled: true }); },
  };
}
