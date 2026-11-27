import { useCallback, useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { useElementSize } from '../common/useElementSize';
import {
  layoutAllDayLanes, layoutDaySegments, startOfDay, type CalEvent,
} from './calendarEvents';
import { CalendarEventChip } from './CalendarEventChip';
import type { CalendarLook } from './useCalendarData';
import type { CalendarFormat } from './useCalendarFormat';
import styles from './CalendarTimeGrid.module.scss';

const FIXED_WINDOW_HOURS = 4;
const FALLBACK_HOUR_HEIGHT = 46;
const SCROLL_LEAD_HOURS = 2.2;
const DEFAULT_SCROLL_HOUR = 7.5;

interface Props {
  days: readonly number[];
  events: readonly CalEvent[];
  now: number;
  fmt: CalendarFormat;
  lookFor: (calendarId: string) => CalendarLook;
  // Panel without touch: a fixed window around now that never scrolls.
  fixedWindow?: boolean;
  // Narrow portrait panel: smaller type.
  compact?: boolean;
  // Dashboard page sizing and its event buttons.
  variant?: 'panel' | 'page';
  onEventPress?: (ev: CalEvent, el: HTMLElement) => void;
  selectedEventId?: string | null;
}

const minutesOf = (ms: number) => {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
};

export function CalendarTimeGrid({ days, events, now, fmt, lookFor, fixedWindow, compact, variant = 'panel', onEventPress, selectedEventId }: Props) {
  const { t } = useTranslation();
  const { ref, size } = useElementSize();
  const scrollNode = useRef<HTMLDivElement | null>(null);
  const setScrollNode = useCallback((node: HTMLDivElement | null) => { scrollNode.current = node; ref(node); }, [ref]);

  const hourHeight = fixedWindow && size ? size.height / FIXED_WINDOW_HOURS : variant === 'page' ? 52 : FALLBACK_HOUR_HEIGHT;
  const today = startOfDay(now);
  const showsToday = days.includes(today);
  const nowMin = minutesOf(now);

  const columns = useMemo(() => days.map(day => ({ day, segments: layoutDaySegments(events, day) })), [days, events]);
  const lanes = useMemo(() => layoutAllDayLanes(events, days), [events, days]);
  const laneCount = lanes.length === 0 ? 0 : Math.max(...lanes.map(l => l.lane)) + 1;

  const firstDay = days[0];
  // A fixed window re-anchors each hour so "now" stays inside it; scrollable grids are left where the user put them.
  const windowHour = fixedWindow ? Math.floor(nowMin / 60) : 0;
  useLayoutEffect(() => {
    const node = scrollNode.current;
    if (!node) return;
    const startHour = fixedWindow ? Math.max(0, nowMin / 60 - 1) : showsToday ? Math.max(0, nowMin / 60 - SCROLL_LEAD_HOURS) : DEFAULT_SCROLL_HOUR;
    node.scrollTop = startHour * hourHeight;
    // Re-anchor when the visible days or the measured hour height change, not on the minute tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstDay, days.length, fixedWindow, hourHeight, windowHour]);

  const hours = Array.from({ length: 23 }, (_, i) => i + 1);
  const rootClass = [styles.root, compact ? styles.compact : '', variant === 'page' ? styles.page : ''].filter(Boolean).join(' ');

  return (
    <div className={rootClass} style={{ '--days': days.length, '--hh': `${hourHeight}px` } as CSSProperties}>
      <div className={styles.head}>
        {days.map(day => (
          <div key={day} className={`${styles.weekday} ${day === today ? styles.weekdayToday : ''}`}>
            {fmt.weekdayShort(day)}
            <b>{fmt.dayNumber(day)}</b>
          </div>
        ))}
      </div>
      {laneCount > 0 && (
        <div className={styles.allDay}>
          <span className={styles.allDayLabel}>{t('panel.widget.calendar.allDay')}</span>
          <div className={styles.allDayGrid}>
            {lanes.map(l => {
              const look = lookFor(l.ev.calendarId);
              return (
                <CalendarEventChip
                  key={`${l.ev.id}-${l.startCol}`}
                  className={[styles.allDayChip, l.continuesBefore ? styles.noLeft : '', l.continuesAfter ? styles.noRight : ''].filter(Boolean).join(' ')}
                  color={look.color}
                  style={{ gridColumn: `${l.startCol + 1} / ${l.endCol + 2}`, gridRow: l.lane + 1 }}
                  label={l.ev.title}
                  selected={l.ev.id === selectedEventId}
                  onPress={onEventPress ? el => onEventPress(l.ev, el) : undefined}
                >
                  {l.ev.title}
                </CalendarEventChip>
              );
            })}
          </div>
        </div>
      )}
      <div
        ref={setScrollNode}
        className={`${styles.scroller} ${fixedWindow ? styles.fixed : ''}`}
        data-panel-scrollable="true"
      >
        <div className={styles.inner}>
          {hours.map(h => (
            <span key={h} className={styles.hourLabel} style={{ top: 5 + h * hourHeight }}>{fmt.hour(h)}</span>
          ))}
          {showsToday && (
            <span className={styles.nowLabel} style={{ top: 5 + (nowMin / 60) * hourHeight }}>{fmt.time(now)}</span>
          )}
          <div className={styles.cols}>
            {columns.map(({ day, segments }) => {
              const isToday = day === today;
              return (
                <div key={day} className={`${styles.col} ${isToday ? styles.colToday : ''}`}>
                  {segments.map(({ ev, startMin, endMin, col, cols }) => {
                    const height = Math.max(18, ((endMin - startMin) / 60) * hourHeight - 1);
                    const short = height < 34;
                    const look = lookFor(ev.calendarId);
                    const past = isToday && ev.end <= now;
                    const cls = [styles.block, short ? styles.short : '', past ? styles.past : '', ev.tentative ? styles.tentative : '']
                      .filter(Boolean).join(' ');
                    return (
                      <CalendarEventChip
                        key={`${ev.id}-${day}`}
                        className={cls}
                        color={look.color}
                        style={{
                          top: (startMin / 60) * hourHeight,
                          height,
                          left: `calc(${(col * 100) / cols}% + 1px)`,
                          width: `calc(${100 / cols}% - 2px)`,
                        }}
                        label={ev.title}
                        selected={ev.id === selectedEventId}
                        onPress={onEventPress ? el => onEventPress(ev, el) : undefined}
                      >
                        <div className={styles.blockTitle}>{ev.title}</div>
                        <div className={styles.blockWhen}>
                          {short ? fmt.time(ev.start) : t('panel.widget.calendar.range', { start: fmt.time(ev.start), end: fmt.time(ev.end) })}
                        </div>
                      </CalendarEventChip>
                    );
                  })}
                  {isToday && <div className={styles.nowLine} style={{ top: (nowMin / 60) * hourHeight }} />}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
