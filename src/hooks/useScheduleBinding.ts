import { useTranslation } from '../lib/i18n';
import { nextScheduleChange } from '../lib/brightnessSchedule';
import { useUnitPrefs } from './useUiSettings';
import { hour12OptionFor } from '../lib/units';
import type { BrightnessScheduleBinding } from '../components/common/BrightnessScheduleButton/BrightnessScheduleButton';
import type { BrightnessScheduleState } from './useBrightnessSchedule';

/**
 * Binds one brightness control to the universal schedule: its follow switch,
 * the status line for the popover, and the schedule's own on/off and editor.
 */
export function useScheduleBinding({ state, follows, onFollowsChange, onEdit }: {
  state: BrightnessScheduleState;
  follows: boolean;
  onFollowsChange: (next: boolean) => void;
  onEdit: () => void;
}): BrightnessScheduleBinding {
  const { t } = useTranslation();
  const { timeFormat } = useUnitPrefs();
  const { schedule, sunPoints, current, minute, save } = state;
  const scheduleOn = schedule?.enabled === true;
  let statusLine: string | null = null;
  if (scheduleOn && current !== null) {
    const next = nextScheduleChange(sunPoints ?? schedule.points, minute);
    if (!next) statusLine = t('lighting.schedule.status.steady', { level: current });
    else {
      const time = new Date(2000, 0, 1, next.hour % 24)
        .toLocaleTimeString(undefined, { hour: 'numeric', hour12: hour12OptionFor(timeFormat) });
      statusLine = t(next.rising ? 'lighting.schedule.status.rising' : 'lighting.schedule.status.falling',
        { level: current, next: next.level, time });
    }
  }
  return {
    scheduleOn, follows, onFollowsChange, onEdit, statusLine,
    onTurnOn: () => { if (schedule) void save({ ...schedule, enabled: true }); },
  };
}
