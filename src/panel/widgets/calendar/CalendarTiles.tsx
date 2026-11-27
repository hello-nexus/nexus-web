import type { CSSProperties } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { pluralKey } from '../../../lib/pluralKey';
import type { PanelWidgetSize } from '../../types';
import {
  addDays, buildUpNext, describeWhen, eventsOnDay, selectNextEvents, startOfDay, type CalEvent,
} from './calendarEvents';
import type { CalendarLook } from './useCalendarData';
import type { CalendarFormat } from './useCalendarFormat';
import styles from './CalendarTiles.module.scss';

export interface TileContext {
  now: number;
  events: readonly CalEvent[];
  fmt: CalendarFormat;
  lookFor: (calendarId: string) => CalendarLook;
  // The service has no calendars yet: say so instead of "no more events".
  noCalendars: boolean;
}

const colorVar = (look: CalendarLook) => ({ '--cal-color': look.color }) as CSSProperties;

function WhenLine({ ev, ctx, className }: { ev: CalEvent; ctx: TileContext; className?: string }) {
  const { t } = useTranslation();
  const when = describeWhen(ev, ctx.now, ctx.fmt.time);
  const live = when.key === 'panel.widget.calendar.when.nowUntil';
  const cls = [styles.when, live ? styles.whenNow : '', className ?? ''].filter(Boolean).join(' ');
  return <div className={cls}>{t(when.key, when.params)}</div>;
}

function EventItem({ ev, ctx }: { ev: CalEvent; ctx: TileContext }) {
  return (
    <div className={styles.item} style={colorVar(ctx.lookFor(ev.calendarId))}>
      <span className={styles.bar} />
      <div className={styles.itemText}>
        <div className={styles.title}>{ev.title}</div>
        <WhenLine ev={ev} ctx={ctx} />
      </div>
    </div>
  );
}

function TomorrowItem({ ev, ctx }: { ev: CalEvent; ctx: TileContext }) {
  const { t } = useTranslation();
  return (
    <div className={styles.item} style={colorVar(ctx.lookFor(ev.calendarId))}>
      <span className={styles.bar} />
      <div className={styles.itemText}>
        <div className={styles.dayLabel}>{t('panel.widget.calendar.tomorrow')}</div>
        <div className={styles.title}>{ev.title}</div>
        <div className={styles.when}>{ev.allDay ? t('panel.widget.calendar.allDay') : ctx.fmt.time(ev.start)}</div>
      </div>
    </div>
  );
}

function EmptyLine({ ctx }: { ctx: TileContext }) {
  const { t } = useTranslation();
  return <div className={styles.none}>{t(ctx.noCalendars ? 'panel.widget.calendar.noCalendars' : 'panel.widget.calendar.noMoreToday')}</div>;
}

function MoreLine({ count }: { count: number }) {
  const { t } = useTranslation();
  return count > 0 ? <div className={styles.more}>{t('panel.widget.calendar.moreToday', { count })}</div> : null;
}

const CAPACITY: Partial<Record<PanelWidgetSize, number>> = { '2x2': 1, '2x2round': 1, '4x2': 3, '2x4': 4 };

export function NextEventTile({ size, ctx }: { size: PanelWidgetSize; ctx: TileContext }) {
  const { t } = useTranslation();
  const next = selectNextEvents(ctx.events, ctx.now, CAPACITY[size] ?? 1);
  const { fmt, now } = ctx;
  const tomorrow = next.tomorrow && !ctx.noCalendars ? <TomorrowItem ev={next.tomorrow} ctx={ctx} /> : null;
  const empty = (
    <div className={styles.tomorrowBlock}>
      <EmptyLine ctx={ctx} />
      {tomorrow}
    </div>
  );
  const items = next.items.map(ev => <EventItem key={ev.id} ev={ev} ctx={ctx} />);

  if (size === '2x4') {
    return (
      <div className={styles.n24}>
        <div className={styles.n24Head}>
          <div className={styles.bigDay}>{fmt.dayNumber(now)}</div>
          <div className={styles.n24HeadCol}>
            <div className={styles.weekday}>{fmt.weekdayShort(now)}</div>
            <div className={styles.monthName}>{fmt.monthLong(now)}</div>
          </div>
        </div>
        <div className={styles.list}>
          {next.items.length > 0 ? <>{items}<MoreLine count={next.hidden} /></> : empty}
        </div>
      </div>
    );
  }
  if (size === '4x2') {
    return (
      <div className={styles.n42}>
        <div className={styles.n42Head}>
          <div className={styles.weekday}>{fmt.weekdayShort(now)}</div>
          <div className={styles.bigDay}>{fmt.dayNumber(now)}</div>
          <div className={styles.monthName}>{fmt.monthLong(now)}</div>
        </div>
        <div className={styles.n42List}>
          {next.items.length > 0 ? <>{items}<MoreLine count={next.hidden} /></> : empty}
        </div>
      </div>
    );
  }
  if (size === '2x2round') {
    const lead = next.items[0];
    const look = lead ? ctx.lookFor(lead.calendarId) : next.tomorrow ? ctx.lookFor(next.tomorrow.calendarId) : null;
    return (
      <div className={styles.round}>
        <div className={styles.weekday}>{fmt.weekdayShort(now)}</div>
        <div className={styles.bigDay}>{fmt.dayNumber(now)}</div>
        <div className={styles.roundEvent} style={look ? colorVar(look) : undefined}>
          {lead ? (
            <>
              <div className={styles.roundTitle}><span className={styles.dot} /><span>{lead.title}</span></div>
              <WhenLine ev={lead} ctx={ctx} />
            </>
          ) : (
            <>
              <EmptyLine ctx={ctx} />
              {next.tomorrow && !ctx.noCalendars && (
                <>
                  <div className={styles.roundTitle}><span className={styles.dot} /><span>{next.tomorrow.title}</span></div>
                  <div className={styles.when}>
                    {t('panel.widget.calendar.tomorrow')}
                    {next.tomorrow.allDay ? '' : `, ${fmt.time(next.tomorrow.start)}`}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className={styles.n22}>
      <div>
        <div className={styles.weekday}>{fmt.weekdayShort(now)}</div>
        <div className={styles.bigDay}>{fmt.dayNumber(now)}</div>
      </div>
      {next.items.length > 0 ? items[0] : empty}
    </div>
  );
}

function TimeRow({ ev, ctx, sub }: { ev: CalEvent; ctx: TileContext; sub: 'range' | 'place' }) {
  const { t } = useTranslation();
  const current = !ev.allDay && ev.start <= ctx.now;
  const look = ctx.lookFor(ev.calendarId);
  const when = current
    ? t('panel.widget.calendar.until', { time: ctx.fmt.time(ev.end) })
    : sub === 'place' && (ev.location || look.name)
      ? ev.location || look.name
      : t('panel.widget.calendar.range', { start: ctx.fmt.time(ev.start), end: ctx.fmt.time(ev.end) });
  return (
    <div className={`${styles.row} ${current ? styles.rowCurrent : ''}`} style={colorVar(look)}>
      <div className={styles.timeCol}>
        {ev.allDay
          ? t('panel.widget.calendar.allDay')
          : current ? <span className={styles.timeColNow}>{t('panel.widget.calendar.now')}</span> : ctx.fmt.time(ev.start)}
      </div>
      <span className={styles.bar} />
      <div className={styles.rowMid}>
        <div className={styles.title}>{ev.title}</div>
        <div className={styles.when}>{when}</div>
      </div>
    </div>
  );
}

/** The list under the 4x4 month grid: what is left today. */
export function TodayList({ ctx }: { ctx: TileContext }) {
  const { t, language } = useTranslation();
  const next = selectNextEvents(ctx.events, ctx.now, 3);
  const total = eventsOnDay(ctx.events, startOfDay(ctx.now));
  const count = total.timed.length + total.allDay.length;
  return (
    <div className={styles.todaySection}>
      <div className={styles.sectionHead}>
        <span>{t('panel.widget.calendar.today')}</span>
        <span>{t(pluralKey('panel.widget.calendar.eventCount', language, count), { count })}</span>
      </div>
      {next.items.length > 0
        ? <>{next.items.map(ev => <TimeRow key={ev.id} ev={ev} ctx={ctx} sub="range" />)}<MoreLine count={next.hidden} /></>
        : <EmptyLine ctx={ctx} />}
    </div>
  );
}

/** The 4x4 Up Next layout: the rest of today, then tomorrow with all-day rows first. */
export function UpNextTile({ ctx }: { ctx: TileContext }) {
  const { t, language } = useTranslation();
  const { fmt, now } = ctx;
  const up = buildUpNext(ctx.events, now, 3, 3);
  const tomorrow = addDays(startOfDay(now), 1);
  const todayDay = eventsOnDay(ctx.events, startOfDay(now));
  const todayCount = todayDay.allDay.length + todayDay.timed.length;
  const hasTomorrow = up.tomorrowAllDay.length + up.tomorrowTimed.length > 0;
  return (
    <div className={styles.upNext}>
      <div className={styles.upNextHead}>
        <div>
          <div className={styles.weekday}>{fmt.weekdayLong(now)}</div>
          <div className={styles.upNextBig}>{fmt.monthDayLong(now)}</div>
        </div>
        <div className={styles.monthName}>{t(pluralKey('panel.widget.calendar.eventCount', language, todayCount), { count: todayCount })}</div>
      </div>
      <div className={styles.dayGroup}>
        <div className={styles.sectionHead}><span>{t('panel.widget.calendar.upNext')}</span></div>
        {up.today.length > 0
          ? <>{up.today.map(ev => <TimeRow key={ev.id} ev={ev} ctx={ctx} sub="place" />)}<MoreLine count={up.todayHidden} /></>
          : <EmptyLine ctx={ctx} />}
      </div>
      {hasTomorrow && (
        <div className={styles.dayGroup}>
          <div className={styles.sectionHead}>
            <span>{t('panel.widget.calendar.tomorrow')}</span>
            <span>{fmt.weekdayShort(tomorrow)} {fmt.dayNumber(tomorrow)}</span>
          </div>
          {up.tomorrowAllDay.map(ev => (
            <div key={ev.id} className={styles.allDayRow} style={colorVar(ctx.lookFor(ev.calendarId))}>
              <div className={styles.allDayLabel}>{t('panel.widget.calendar.allDay')}</div>
              <div className={styles.pill}>
                <span>{ev.title}</span>
                {ev.location && <span>{ev.location}</span>}
              </div>
            </div>
          ))}
          {up.tomorrowTimed.map(ev => <TimeRow key={ev.id} ev={ev} ctx={ctx} sub="place" />)}
        </div>
      )}
    </div>
  );
}
