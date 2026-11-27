import { useMemo } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { hour12OptionFor } from '../../../lib/units';

export interface CalendarFormat {
  locale: string;
  time: (ms: number) => string;
  hour: (hour: number) => string;
  weekdayShort: (ms: number) => string;
  weekdayLong: (ms: number) => string;
  dayNumber: (ms: number) => string;
  monthDayShort: (ms: number) => string;
  monthDayLong: (ms: number) => string;
  monthYear: (ms: number) => string;
  monthLong: (ms: number) => string;
  year: (ms: number) => string;
  fullDate: (ms: number) => string;
}

export function useCalendarFormat(): CalendarFormat {
  const { language } = useTranslation();
  const { timeFormat } = useUnitPrefs();
  const hour12 = hour12OptionFor(timeFormat);
  return useMemo(() => {
    const make = (opts: Intl.DateTimeFormatOptions) => {
      const fmt = new Intl.DateTimeFormat(language, opts);
      return (ms: number) => fmt.format(ms);
    };
    const timeFmt = make({ hour: 'numeric', minute: '2-digit', hour12 });
    const hourFmt = make({ hour: 'numeric', hour12 });
    return {
      locale: language,
      time: timeFmt,
      hour: (h: number) => hourFmt(new Date(2000, 0, 1, h).getTime()),
      weekdayShort: make({ weekday: 'short' }),
      weekdayLong: make({ weekday: 'long' }),
      dayNumber: make({ day: 'numeric' }),
      monthDayShort: make({ month: 'short', day: 'numeric' }),
      monthDayLong: make({ month: 'long', day: 'numeric' }),
      monthYear: make({ month: 'long', year: 'numeric' }),
      monthLong: make({ month: 'long' }),
      year: make({ year: 'numeric' }),
      fullDate: make({ weekday: 'long', month: 'long', day: 'numeric' }),
    };
  }, [language, hour12]);
}
