import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Calendar1, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, List } from 'lucide-react';
import { useTranslation } from '../../../../lib/i18n';
import { Button } from '../../../../components/common/Button/Button';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import { Notice } from '../../../../components/common/Notice/Notice';
import { ViewHeader } from '../../../../components/common/ViewHeader/ViewHeader';
import { useElementSize } from '../../common/useElementSize';
import { resolveWeekStart } from '../calendar';
import {
  addDays, addMonths, monthWeeks, startOfDay, startOfMonth, startOfWeek, type CalEvent, type ImmersiveView,
} from '../calendarEvents';
import { CalendarAgendaList } from '../CalendarAgendaList';
import { CalendarEventPopover, CalendarMorePopover } from '../CalendarEventPopover';
import { CalendarMonthGrid } from '../CalendarMonthGrid';
import { CalendarTimeGrid } from '../CalendarTimeGrid';
import { useCalendarData } from '../useCalendarData';
import { useCalendarFormat } from '../useCalendarFormat';
import { CalendarRail } from './CalendarRail';
import styles from './CalendarPage.module.scss';

const PAGE_VIEWS: readonly ImmersiveView[] = ['day', 'week', 'month', 'list'];
const DEFAULT_VIEW: ImmersiveView = 'month';
const HIDDEN_STORAGE_KEY = 'nexus.calendar.hiddenCalendars';
const LIST_DAYS = 21;
const MONTH_VIEW_CHROME_PX = 40;
const MONTH_LINE_PX = 16;
const MONTH_DAY_NUMBER_PX = 28;

const VIEW_ICONS: Record<ImmersiveView, ReactNode> = {
  day: <Calendar1 size={14} />,
  week: <CalendarRange size={14} />,
  month: <CalendarDays size={14} />,
  list: <List size={14} />,
};

const VIEW_KEYS: Record<ImmersiveView, string> = {
  day: 'panel.widget.calendar.view.day',
  week: 'panel.widget.calendar.view.week',
  month: 'panel.widget.calendar.view.month',
  list: 'panel.widget.calendar.view.list',
};

function readHidden(): string[] {
  try {
    const raw = window.localStorage.getItem(HIDDEN_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function writeHidden(ids: string[]) {
  try {
    window.localStorage.setItem(HIDDEN_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Storage unavailable: the filter lasts for this visit only.
  }
}

type Popup =
  | { kind: 'event'; event: CalEvent; anchor: HTMLElement }
  | { kind: 'more'; day: number; anchor: HTMLElement };

interface Props {
  tab?: string | null;
  onTabChange?: (tab: string) => void;
}

/** Desktop calendar page: Day / Week / Month / List over the service's synced calendars. */
export function CalendarPage({ tab, onTabChange }: Props) {
  const { t, language } = useTranslation();
  const fmt = useCalendarFormat();
  const view: ImmersiveView = (PAGE_VIEWS as readonly string[]).includes(tab ?? '') ? (tab as ImmersiveView) : DEFAULT_VIEW;
  const weekStart = resolveWeekStart('auto', language);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const today = startOfDay(now);

  const [anchor, setAnchor] = useState(() => startOfDay(Date.now()));
  const [miniMonth, setMiniMonth] = useState(() => startOfMonth(Date.now()));
  useEffect(() => { setMiniMonth(startOfMonth(anchor)); }, [anchor]);

  const [hidden, setHidden] = useState<string[]>(readHidden);
  const [popup, setPopup] = useState<Popup | null>(null);

  const { ref: viewRef, size } = useElementSize();
  const bodyRef = useRef<HTMLDivElement>(null);

  const monthStart = startOfMonth(anchor);
  const weeks = useMemo(() => monthWeeks(monthStart, weekStart), [monthStart, weekStart]);
  const range = useMemo(() => {
    switch (view) {
      case 'day': return { from: anchor, to: addDays(anchor, 1), days: [anchor] };
      case 'week': {
        const first = startOfWeek(anchor, weekStart);
        return { from: first, to: addDays(first, 7), days: Array.from({ length: 7 }, (_, i) => addDays(first, i)) };
      }
      case 'month': return { from: weeks[0][0], to: addDays(weeks[weeks.length - 1][6], 1), days: [] as number[] };
      default: return { from: anchor, to: addDays(anchor, LIST_DAYS), days: [] as number[] };
    }
  }, [view, anchor, weekStart, weeks]);

  const data = useCalendarData({ from: range.from, to: range.to, hidden, enabled: true, preview: false, now });
  const noCalendars = data.loaded && data.sources.length === 0;

  const monthLines = size
    ? Math.max(2, Math.min(8, Math.floor((((size.height - MONTH_VIEW_CHROME_PX) / weeks.length) - MONTH_DAY_NUMBER_PX) / MONTH_LINE_PX)))
    : 4;

  const closePopup = useCallback(() => setPopup(null), []);
  const openEvent = useCallback((event: CalEvent, anchorEl: HTMLElement) => {
    setPopup(prev => (prev?.kind === 'event' && prev.event.id === event.id && prev.anchor === anchorEl ? null : { kind: 'event', event, anchor: anchorEl }));
  }, []);
  const openMore = useCallback((day: number, anchorEl: HTMLElement) => {
    setPopup(prev => (prev?.kind === 'more' && prev.day === day ? null : { kind: 'more', day, anchor: anchorEl }));
  }, []);

  const changeView = (next: string) => { setPopup(null); onTabChange?.(next); };
  const step = (dir: 1 | -1) => {
    setPopup(null);
    if (view === 'day') setAnchor(addDays(anchor, dir));
    else if (view === 'month') setAnchor(addMonths(anchor, dir));
    else setAnchor(addDays(anchor, 7 * dir));
  };
  const selectDay = (day: number) => {
    setPopup(null);
    setAnchor(day);
    if (view === 'month') changeView('day');
  };
  const toggleCalendar = (id: string, visible: boolean) => {
    const next = visible ? hidden.filter(h => h !== id) : [...hidden.filter(h => h !== id), id];
    setHidden(next);
    writeHidden(next);
  };
  const title = (() => {
    if (view === 'day') return { main: fmt.fullDate(anchor) };
    if (view === 'week') {
      const first = startOfWeek(anchor, weekStart);
      const last = addDays(first, 6);
      const sameMonth = new Date(first).getMonth() === new Date(last).getMonth();
      return {
        main: t('panel.widget.calendar.rangeTitle', { start: fmt.monthDayShort(first), end: sameMonth ? fmt.dayNumber(last) : fmt.monthDayShort(last) }),
        dim: fmt.year(last),
      };
    }
    if (view === 'month') return { main: fmt.monthLong(anchor), dim: fmt.year(anchor) };
    return { main: t('panel.widget.calendar.title.upcoming'), dim: t('panel.widget.calendar.title.from', { date: fmt.monthDayShort(anchor) }) };
  })();

  const popupEvent = popup?.kind === 'event' ? popup.event : null;

  return (
    <div className={styles.page}>
      <ViewHeader
        title={t('panel.widget.calendar')}
        tabs={PAGE_VIEWS.map(v => ({ key: v, label: t(VIEW_KEYS[v]), icon: VIEW_ICONS[v] }))}
        activeTab={view}
        onTabChange={changeView}
      />
      <div ref={bodyRef} className="pageBodyFill">
        <div className={styles.body}>
          <CalendarRail
            miniMonth={miniMonth}
            selected={anchor}
            today={today}
            weekStart={weekStart}
            highlightWeek={view === 'week' || view === 'list'}
            onSelectDay={selectDay}
            onMonthChange={delta => setMiniMonth(addMonths(miniMonth, delta))}
          onSelectMonth={monthStart => { setPopup(null); setAnchor(monthStart); }}
            hidden={hidden}
            onToggle={toggleCalendar}
          />
          <div className={styles.main}>
            {data.truncated && <Notice tone="info" role="status">{t('panel.widget.calendar.events.truncated')}</Notice>}
            {noCalendars && (
              <Notice tone="info" role="status">
                {t('panel.widget.calendar.page.empty')}
              </Notice>
            )}
            <div className={styles.toolbar}>
              <div className={styles.title}>{title.main}{title.dim && <span> {title.dim}</span>}</div>
              <Button size="sm" tone="neutral" onClick={() => { setPopup(null); setAnchor(today); }}>{t('panel.widget.calendar.today')}</Button>
              <HoverTooltip body={t('panel.widget.calendar.prev')}>
                <Button size="sm" tone="neutral" icon={<ChevronLeft size={16} aria-hidden />} aria-label={t('panel.widget.calendar.prev')} onClick={() => step(-1)} />
              </HoverTooltip>
              <HoverTooltip body={t('panel.widget.calendar.next')}>
                <Button size="sm" tone="neutral" icon={<ChevronRight size={16} aria-hidden />} aria-label={t('panel.widget.calendar.next')} onClick={() => step(1)} />
              </HoverTooltip>
            </div>
            <div ref={viewRef} className={styles.viewBox}>
              {(view === 'day' || view === 'week') && (
                <CalendarTimeGrid
                  days={range.days}
                  events={data.events}
                  now={now}
                  fmt={fmt}
                  lookFor={data.lookFor}
                  variant="page"
                  onEventPress={openEvent}
                  selectedEventId={popupEvent?.id}
                />
              )}
              {view === 'month' && (
                <CalendarMonthGrid
                  monthStart={monthStart}
                  weekStart={weekStart}
                  events={data.events}
                  now={now}
                  fmt={fmt}
                  lookFor={data.lookFor}
                  rows={monthLines}
                  showTimes
                  variant="page"
                  onEventPress={openEvent}
                  onMorePress={openMore}
                  onDayPress={selectDay}
                  selectedEventId={popupEvent?.id}
                />
              )}
              {view === 'list' && (
                <CalendarAgendaList from={anchor} events={data.events} now={now} fmt={fmt} lookFor={data.lookFor} variant="page" onEventPress={openEvent} selectedEventId={popupEvent?.id} />
              )}
            </div>
          </div>
        </div>
      </div>

      <CalendarEventPopover
        event={popupEvent}
        anchor={popup?.anchor ?? null}
        fmt={fmt}
        boundsRef={bodyRef}
        look={popupEvent ? data.lookFor(popupEvent.calendarId) : { name: '', color: '' }}
        onClose={closePopup}
      />
      <CalendarMorePopover
        day={popup?.kind === 'more' ? popup.day : null}
        anchor={popup?.anchor ?? null}
        events={data.events}
        now={now}
        fmt={fmt}
        lookFor={data.lookFor}
        boundsRef={bodyRef}
        onPick={(ev, el) => setPopup({ kind: 'event', event: ev, anchor: el })}
        onClose={closePopup}
      />
    </div>
  );
}

export default CalendarPage;
