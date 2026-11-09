import { useTranslation } from '../lib/i18n';
import { scheduleOutlook } from '../lib/brightnessSchedule';
import { useUnitPrefs } from './useUiSettings';
import { hour12OptionFor } from '../lib/units';
import type { BrightnessScheduleBinding } from '../components/common/BrightnessScheduleButton/BrightnessScheduleButton';
import type { BrightnessScheduleState } from './useBrightnessSchedule';

/**
 * Binds one brightness control to the universal schedule: its follow switch,
 * the status line for the popover, and the schedule's own on/off and editor.
 * `appliedPercent` is the level this control actually wears (its slider times
 * the schedule); without it the status falls back to the schedule's level.
 */
export function useScheduleBinding({ state, follows, onFollowsChange, onEdit, appliedPercent = null }: {
  state: BrightnessScheduleState;
  follows: boolean;
  onFollowsChange: (next: boolean) => void;
  onEdit: () => void;
  appliedPercent?: number | null;
}): BrightnessScheduleBinding {
  const { t } = useTranslation();
  const { timeFormat } = useUnitPrefs();
  const { schedule, sunPoints, current, minute, save } = state;
  const scheduleOn = schedule?.enabled === true;
  let statusLine: string | null = null;
  if (scheduleOn && current !== null) {
    const level = follows ? (appliedPercent ?? current) : current;
    const outlook = scheduleOutlook(sunPoints ?? schedule.points, minute);
    const clock = (m: number) => new Date(2000, 0, 1, Math.floor(m / 60) % 24, Math.floor(m % 60))
      .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: hour12OptionFor(timeFormat) });
    if (outlook.kind === 'steady') statusLine = t('lighting.schedule.status.steady', { level });
    else if (outlook.kind === 'moving') {
      statusLine = t(outlook.rising ? 'lighting.schedule.status.rising' : 'lighting.schedule.status.falling',
        { level, time: clock(outlook.untilMinute) });
    } else {
      statusLine = t(outlook.rising ? 'lighting.schedule.status.risesAt' : 'lighting.schedule.status.fallsAt',
        { level, time: clock(outlook.startMinute) });
    }
  }
  return {
    scheduleOn, follows, onFollowsChange, onEdit, statusLine,
    capPercent: scheduleOn && follows && current !== null ? (appliedPercent ?? current) : null,
    onTurnOn: () => { if (schedule) void save({ ...schedule, enabled: true }); },
  };
}
