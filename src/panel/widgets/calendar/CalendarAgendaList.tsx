import { useMemo } from 'react';
import { useElementSize } from '../common/useElementSize';
import { useTranslation } from '../../../lib/i18n';
import { addDays, groupAgenda, startOfDay, type CalEvent } from './calendarEvents';
import { CalendarEventChip } from './CalendarEventChip';
import type { CalendarLook } from './useCalendarData';
import type { CalendarFormat } from './useCalendarFormat';
import styles from './CalendarAgendaList.module.scss';

const AGENDA_DAYS = 21;
// Below this width the day label sits on its own row above that day's events.
const NARROW_WIDTH = 520;

interface Props {
  from: number;
  events: readonly CalEvent[];
  now: number;
  fmt: CalendarFormat;
  lookFor: (calendarId: string) => CalendarLook;
  variant?: 'panel' | 'page';
  onEventPress?: (ev: CalEvent, el: HTMLElement) => void;
  selectedEventId?: string | null;
}

/** Schedule-style list: days that have events, all-day rows first, the current event marked "Now". */
export function CalendarAgendaList({ from, events, now, fmt, lookFor, variant = 'panel', onEventPress, selectedEventId }: Props) {
  const { t } = useTranslation();
  const today = startOfDay(now);
  const { ref, size } = useElementSize();
  const narrow = size !== null && size.width < NARROW_WIDTH;
  const groups = useMemo(() => groupAgenda(events, from, AGENDA_DAYS), [events, from]);

  if (groups.length === 0) {
    return <div className={styles.empty}>{t('panel.widget.calendar.noUpcoming')}</div>;
  }

  const dayLabel = (day: number) => {
    if (day === today) return t('panel.widget.calendar.today');
    if (day === addDays(today, 1)) return t('panel.widget.calendar.tomorrow');
    return fmt.weekdayLong(day);
  };

  return (
    <div ref={ref} className={`${styles.list} ${variant === 'page' ? styles.page : ''} ${narrow ? styles.narrow : ''}`} data-panel-scrollable="true">
      {groups.map(group => (
        <div key={group.day} className={styles.group}>
          <div className={`${styles.groupHead} ${group.day === today ? styles.groupToday : ''}`}>
            <b>{dayLabel(group.day)}</b>
            <span>{fmt.weekdayShort(group.day)}, {fmt.monthDayShort(group.day)}</span>
          </div>
          <div className={styles.rows}>
            {group.events.map(ev => {
              const look = lookFor(ev.calendarId);
              const isToday = group.day === today;
              const past = isToday && !ev.allDay && ev.end <= now;
              const current = isToday && !ev.allDay && ev.start <= now && ev.end > now;
              const sub = [look.name, ev.location].filter(Boolean).join(', ');
              return (
                <CalendarEventChip
                  key={`${ev.id}-${group.day}`}
                  className={[styles.row, past ? styles.past : '', current ? styles.current : '', onEventPress ? styles.press : ''].filter(Boolean).join(' ')}
                  color={look.color}
                  label={ev.title}
                  selected={ev.id === selectedEventId}
                  onPress={onEventPress ? el => onEventPress(ev, el) : undefined}
                >
                  <div className={styles.time}>
                    {ev.allDay
                      ? t('panel.widget.calendar.allDay')
                      : (
                        <>
                          {current ? <span className={styles.now}>{t('panel.widget.calendar.now')}</span> : fmt.time(ev.start)}
                          <small>{fmt.time(ev.end)}</small>
                        </>
                      )}
                  </div>
                  <span className={styles.bar} />
                  <div className={styles.mid}>
                    <b>{ev.title}</b>
                    {sub && <span>{sub}</span>}
                  </div>
                </CalendarEventChip>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
