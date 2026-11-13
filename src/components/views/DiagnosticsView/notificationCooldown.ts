import type { ChipOption } from '../../common/ChipGroup/ChipGroup';

export const COOLDOWN_OPTIONS_MINUTES = [15, 30, 60, 120, 360, 1440] as const;

type Translate = (key: string, params?: Record<string, string | number>) => string;

function formatDurationMinutes(t: Translate, minutes: number): string {
  if (minutes < 60) return t('diagnostics.duration.minutes', { m: minutes });
  return t('diagnostics.duration.hours', { h: minutes / 60 });
}

export function durationOptions(t: Translate, minuteValues: readonly number[]): ChipOption[] {
  return minuteValues.map(minutes => ({ key: String(minutes), label: formatDurationMinutes(t, minutes) }));
}
