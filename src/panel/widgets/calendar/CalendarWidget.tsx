import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { WidgetProps } from '../types';
import { widgetLayoutSize, type PanelWidgetSize } from '../../types';
import { useTranslation } from '../../../lib/i18n';
import { buildMonthCells, resolveWeekStart, weekdayInitials, type WeekStartConfig } from './calendar';
import {
  addDays, addMonths, dotCalendarsOnDay, hiddenCalendarIds, resolveCalendarDisplay, startOfDay, startOfMonth,
  type CalEvent,
} from './calendarEvents';
import { NextEventTile, TodayList, UpNextTile, type TileContext } from './CalendarTiles';
import { previewNow, useCalendarData, type CalendarLook } from './useCalendarData';
import { useCalendarFormat } from './useCalendarFormat';
import { usePanelPreview } from '../common/PanelPreviewContext';
import { FitLine } from '../common/FitLine';
import { StableDigits } from '../common/StableDigits';
import styles from './CalendarWidget.module.scss';

/**
 * Calendar widget. Two toggles pick the content:
 *   neither     - a glanceable date card (weekday / big day number / month).
 *   events      - the date plus the upcoming events (the Up Next list at 4x4).
 *   grid        - the month grid with today circled and an event dot per calendar.
 *   grid+events - the grid, with today's list under it at 4x4.
 * The tile is non-interactive so it works identically on touch and
 * display-only (Q60) surfaces.
 */
export function CalendarWidget({ widget }: WidgetProps) {
  const { language } = useTranslation();
  const preview = usePanelPreview();
  const fmt = useCalendarFormat();
  const [realNow, setNow] = useState(() => Date.now());

  useEffect(() => {
    // A calendar only rolls at the day boundary and "in N min" is minute-grained; a minute tick covers both without a per-second wakeup.
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const now = preview ? previewNow(realNow) : realNow;
  const config = widget.config;
  const { grid, events: showEvents } = resolveCalendarDisplay(config, widget.size);
  const showDots = config?.showDots !== false;
  const weekStartCfg = (config?.weekStart as WeekStartConfig | undefined) ?? 'auto';
  const size = widgetLayoutSize(widget.size);

  const today = startOfDay(now);
  const monthStart = startOfMonth(now);
  const wantsEvents = showEvents || (grid && showDots);
  const data = useCalendarData({
    from: grid ? monthStart : today,
    to: grid ? addMonths(monthStart, 1) : addDays(today, 2),
    hidden: hiddenCalendarIds(config),
    enabled: wantsEvents,
    preview,
    now,
  });
  const ctx: TileContext = {
    now, events: data.events, fmt, lookFor: data.lookFor, noCalendars: data.loaded && data.sources.length === 0,
  };

  if (!grid && showEvents) {
    return size === '4x4'
      ? <UpNextTile ctx={ctx} />
      : <NextEventTile size={widget.size === '2x2round' ? '2x2round' : size} ctx={ctx} />;
  }
  if (grid) {
    return (
      <MonthView
        now={new Date(now)}
        locale={language}
        size={size}
        weekStart={resolveWeekStart(weekStartCfg, language)}
        events={showDots ? data.events : NO_EVENTS}
        lookFor={data.lookFor}
        list={showEvents && size === '4x4' && !ctx.noCalendars ? <TodayList ctx={ctx} /> : null}
      />
    );
  }
  return <DateCard now={new Date(now)} locale={language} size={size} />;
}

const NO_EVENTS: readonly CalEvent[] = [];

function DateCard({ now, locale, size }: { now: Date; locale: string; size: PanelWidgetSize }) {
  // Narrow portrait tiles can't fit a long weekday name next to the hero number.
  const narrow = size === '2x2' || size === '2x4';
  const weekday = new Intl.DateTimeFormat(locale, { weekday: narrow ? 'short' : 'long' }).format(now);
  const day = new Intl.DateTimeFormat(locale, { day: 'numeric' }).format(now);
  const monthYear = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(now);
  return (
    <div className={`${styles.card} ${styles[`s-${size}`]}`}>
      <FitLine className={styles.weekday} text={weekday} />
      <div className={styles.day}><StableDigits text={day} /></div>
      <FitLine className={styles.monthYear} text={monthYear} />
    </div>
  );
}

function MonthView({
  now, locale, size, weekStart, events, lookFor, list,
}: {
  now: Date; locale: string; size: PanelWidgetSize; weekStart: 0 | 1;
  events: readonly CalEvent[]; lookFor: (id: string) => CalendarLook; list: ReactNode;
}) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const todayDay = now.getDate();
  const cells = useMemo(() => buildMonthCells(year, month, weekStart), [year, month, weekStart]);
  const initials = useMemo(() => weekdayInitials(locale, weekStart), [locale, weekStart]);
  const dotsByDay = useMemo(() => {
    const out = new Map<number, string[]>();
    if (events.length === 0) return out;
    for (let d = 1; d <= 31; d++) {
      const dayStart = new Date(year, month, d).getTime();
      if (new Date(dayStart).getMonth() !== month) break;
      const ids = dotCalendarsOnDay(events, dayStart);
      if (ids.length > 0) out.set(d, ids);
    }
    return out;
  }, [events, year, month]);
  const showDots = events.length > 0;
  const rows = cells.length / 7;
  // Square/landscape tiles stretch rows to fill the cell; the tall/large tiles
  // keep compact content-height rows so the days don't spread out.
  const fillRows = size === '2x2' || size === '4x2';

  // The same date card sits beside the grid on landscape (4x2) and above it on
  // the tall portrait (2x4); the compact and large square show a text month
  // header instead.
  const showAside = size === '4x2' || size === '2x4';
  const showHeader = size === '2x2' || size === '4x4';
  const headerLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(now);
  const withList = list !== null;

  return (
    <div className={`${styles.month} ${styles[`s-${size}`]} ${withList ? styles.withList : ''}`}>
      {showAside && (
        <div className={styles.aside}>
          <DateCard now={now} locale={locale} size="2x2" />
        </div>
      )}
      <div className={styles.calBody}>
        {showHeader && <FitLine className={styles.header} text={headerLabel} align="start" />}
        <div className={styles.weekRow}>
          {initials.map((w, i) => (
            <span key={i} className={styles.weekName}>{w}</span>
          ))}
        </div>
        <div className={styles.grid} style={{ gridTemplateRows: `repeat(${rows}, ${fillRows ? '1fr' : 'auto'})` }}>
          {cells.map((c, i) => {
            // Adjacent-month padding days are left blank; the empty cell keeps
            // the grid aligned.
            if (!c.inMonth) return <span key={i} className={styles.cell} />;
            const dow = (weekStart + (i % 7)) % 7;
            const isWeekend = dow === 0 || dow === 6;
            const cls = [
              styles.cell, showDots ? styles.hasDots : '', isWeekend ? styles.weekend : '', c.day === todayDay ? styles.today : '',
            ].filter(Boolean).join(' ');
            const dots = dotsByDay.get(c.day);
            return (
              <span key={i} className={cls}>
                <span className={styles.dayNum}><StableDigits text={String(c.day)} /></span>
                {showDots && (
                  <span className={styles.dots}>
                    {dots?.map(id => <i key={id} style={{ background: lookFor(id).color }} />)}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      </div>
      {list}
    </div>
  );
}

export default CalendarWidget;
