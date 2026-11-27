import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { WidgetProps } from '../types';
import { surfaceSupportsTouch } from '../../types';
import { useTranslation } from '../../../lib/i18n';
import { resolveWeekStart, type WeekStartConfig } from './calendar';
import {
  addDays, addMonths, hiddenCalendarIds, IMMERSIVE_VIEWS, monthWeeks, resolveImmersiveView, startOfDay, startOfMonth, startOfWeek,
  type ImmersiveView,
} from './calendarEvents';
import { CalendarAgendaList } from './CalendarAgendaList';
import { CalendarMonthGrid } from './CalendarMonthGrid';
import { CalendarTimeGrid } from './CalendarTimeGrid';
import { useCalendarData } from './useCalendarData';
import { useCalendarFormat, type CalendarFormat } from './useCalendarFormat';
import { useElementSize } from '../common/useElementSize';
import styles from './CalendarImmersive.module.scss';

const VIEW_KEYS: Record<ImmersiveView, string> = {
  day: 'panel.widget.calendar.view.day',
  week: 'panel.widget.calendar.view.week',
  month: 'panel.widget.calendar.view.month',
  list: 'panel.widget.calendar.view.list',
};

const LIST_DAYS = 21;
const MONTH_ROWS_LANDSCAPE = 3;
const MONTH_ROWS_PORTRAIT = 6;

/**
 * Fullscreen calendar. A panel with touch gets the view switcher, Today and
 * the arrows; a display-only panel shows the widget's configured view (Day and
 * Week as a fixed window around now) because it cannot switch.
 */
export function CalendarImmersive({ widget, surface, deviceTouch }: WidgetProps) {
  const { t, language } = useTranslation();
  const fmt = useCalendarFormat();
  const { ref, size } = useElementSize();
  const landscape = !size || size.width >= size.height;
  const interactive = surfaceSupportsTouch(surface ?? 'desktop', deviceTouch);

  const config = widget.config;
  const weekStart = resolveWeekStart((config?.weekStart as WeekStartConfig | undefined) ?? 'auto', language);
  const defaultView = resolveImmersiveView(config, landscape);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const [picked, setPicked] = useState<ImmersiveView | null>(null);
  const view = interactive && picked ? picked : defaultView;
  const [pickedAnchor, setAnchor] = useState(() => startOfDay(Date.now()));
  const today = startOfDay(now);
  // Until the user navigates away, the view follows today and rolls over at midnight, so a kiosk left on overnight shows the new day.
  const [following, setFollowing] = useState(true);
  const anchor = interactive && !following ? pickedAnchor : today;

  const range = useMemo(() => {
    switch (view) {
      case 'day': return { from: anchor, to: addDays(anchor, 1), days: [anchor] };
      case 'week': {
        const first = startOfWeek(anchor, weekStart);
        return { from: first, to: addDays(first, 7), days: Array.from({ length: 7 }, (_, i) => addDays(first, i)) };
      }
      case 'month': {
        const weeks = monthWeeks(startOfMonth(anchor), weekStart);
        return { from: weeks[0][0], to: addDays(weeks[weeks.length - 1][6], 1), days: [] as number[] };
      }
      default: return { from: anchor, to: addDays(anchor, LIST_DAYS), days: [] as number[] };
    }
  }, [view, anchor, weekStart]);

  const data = useCalendarData({ from: range.from, to: range.to, hidden: hiddenCalendarIds(config), enabled: true, preview: false, now });

  const step = (dir: 1 | -1) => {
    setFollowing(false);
    if (view === 'day') setAnchor(addDays(anchor, dir));
    else if (view === 'month') setAnchor(addMonths(anchor, dir));
    else setAnchor(addDays(anchor, 7 * dir));
  };
  const pick = (next: ImmersiveView) => {
    setPicked(next);
    if (following) return;
    if (view === 'month' && next !== 'month' && startOfMonth(anchor) === startOfMonth(today)) setAnchor(today);
    if (next === 'month') setAnchor(startOfMonth(anchor));
  };

  const title = titleFor(view, anchor, weekStart, fmt, t);
  const rootClass = `${styles.root} ${landscape ? styles.landscape : styles.portrait}`;

  return (
    <div ref={ref} className={rootClass}>
      <div className={styles.toolbar}>
        <div className={styles.title}>{title.main}{title.dim && <span>{title.dim}</span>}</div>
        {interactive && (
          <>
            <div className={styles.segment} role="group" aria-label={t('panel.widget.calendar.view.label')}>
              {IMMERSIVE_VIEWS.map(v => (
                <button key={v} type="button" aria-pressed={v === view} onClick={() => pick(v)}>{t(VIEW_KEYS[v])}</button>
              ))}
            </div>
            <div className={styles.nav}>
              <button type="button" className={styles.todayButton} onClick={() => setFollowing(true)}>
                {t('panel.widget.calendar.today')}
              </button>
              <button type="button" className={styles.arrow} aria-label={t('panel.widget.calendar.prev')} onClick={() => step(-1)}>
                <ChevronLeft size={16} aria-hidden />
              </button>
              <button type="button" className={styles.arrow} aria-label={t('panel.widget.calendar.next')} onClick={() => step(1)}>
                <ChevronRight size={16} aria-hidden />
              </button>
            </div>
          </>
        )}
      </div>
      <div className={styles.view}>
        {(view === 'day' || view === 'week') && (
          <CalendarTimeGrid
            days={range.days}
            events={data.events}
            now={now}
            fmt={fmt}
            lookFor={data.lookFor}
            fixedWindow={!interactive}
            compact={!landscape && view === 'week'}
          />
        )}
        {view === 'month' && (
          <CalendarMonthGrid
            monthStart={startOfMonth(anchor)}
            weekStart={weekStart}
            events={data.events}
            now={now}
            fmt={fmt}
            lookFor={data.lookFor}
            rows={landscape ? MONTH_ROWS_LANDSCAPE : MONTH_ROWS_PORTRAIT}
            compact={!landscape}
          />
        )}
        {view === 'list' && (
          <CalendarAgendaList from={anchor} events={data.events} now={now} fmt={fmt} lookFor={data.lookFor} />
        )}
      </div>
    </div>
  );
}

function titleFor(
  view: ImmersiveView, anchor: number, weekStart: 0 | 1, fmt: CalendarFormat, t: (key: string, params?: Record<string, string | number>) => string,
): { main: string; dim?: string } {
  if (view === 'day') return { main: fmt.fullDate(anchor) };
  if (view === 'week') {
    const first = startOfWeek(anchor, weekStart);
    const last = addDays(first, 6);
    const sameMonth = new Date(first).getMonth() === new Date(last).getMonth();
    return {
      main: t('panel.widget.calendar.rangeTitle', {
        start: fmt.monthDayShort(first),
        end: sameMonth ? fmt.dayNumber(last) : fmt.monthDayShort(last),
      }),
      dim: fmt.year(last),
    };
  }
  if (view === 'month') return { main: fmt.monthLong(anchor), dim: fmt.year(anchor) };
  return { main: t('panel.widget.calendar.title.upcoming'), dim: t('panel.widget.calendar.title.from', { date: fmt.monthDayShort(anchor) }) };
}

export default CalendarImmersive;
