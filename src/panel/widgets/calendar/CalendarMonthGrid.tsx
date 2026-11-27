import { useMemo, type CSSProperties } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { monthWeeks, planMonthWeek, startOfDay, type CalEvent } from './calendarEvents';
import { CalendarEventChip } from './CalendarEventChip';
import type { CalendarLook } from './useCalendarData';
import type { CalendarFormat } from './useCalendarFormat';
import styles from './CalendarMonthGrid.module.scss';

interface Props {
  monthStart: number;
  weekStart: 0 | 1;
  events: readonly CalEvent[];
  now: number;
  fmt: CalendarFormat;
  lookFor: (calendarId: string) => CalendarLook;
  // Event rows under each day number; the rest fold into "+N more".
  rows: number;
  // Start time before the title (wide panels and the page). Immersive month shows titles only.
  showTimes?: boolean;
  compact?: boolean;
  variant?: 'panel' | 'page';
  onEventPress?: (ev: CalEvent, el: HTMLElement) => void;
  onMorePress?: (day: number, el: HTMLElement) => void;
  selectedEventId?: string | null;
}

export function CalendarMonthGrid({
  monthStart, weekStart, events, now, fmt, lookFor, rows, showTimes = false, compact, variant = 'panel', onEventPress, onMorePress, selectedEventId,
}: Props) {
  const { t } = useTranslation();
  const today = startOfDay(now);
  const month = new Date(monthStart).getMonth();
  const weeks = useMemo(() => monthWeeks(monthStart, weekStart).map(days => planMonthWeek(events, days, rows)), [monthStart, weekStart, events, rows]);
  const headerDays = weeks[0].days;
  const rootClass = [styles.root, compact ? styles.compact : '', variant === 'page' ? styles.page : ''].filter(Boolean).join(' ');

  return (
    <div className={rootClass} style={{ '--rows': rows } as CSSProperties}>
      <div className={styles.head}>
        {headerDays.map(d => <span key={d}>{fmt.weekdayShort(d)}</span>)}
      </div>
      <div className={styles.weeks}>
        {weeks.map(week => (
          <div key={week.days[0]} className={styles.week}>
            {week.days.map((day, i) => day === today && (
              <div key={`today-${day}`} className={styles.todayFill} style={{ gridColumn: i + 1 }} aria-hidden />
            ))}
            {week.days.map((day, i) => {
              const dow = new Date(day).getDay();
              const cls = [
                styles.num,
                new Date(day).getMonth() !== month ? styles.out : '',
                dow === 0 || dow === 6 ? styles.weekend : '',
                day === today ? styles.today : '',
              ].filter(Boolean).join(' ');
              return (
                <div key={day} className={cls} style={{ gridColumn: i + 1 }} data-today={day === today ? 'true' : undefined}>
                  <span>{fmt.dayNumber(day)}</span>
                </div>
              );
            })}
            {week.bars.map(bar => {
              const look = lookFor(bar.ev.calendarId);
              return (
                <CalendarEventChip
                  key={`${bar.ev.id}-${bar.startCol}`}
                  className={[styles.bar, bar.continuesBefore ? '' : styles.barStart, bar.continuesAfter ? '' : styles.barEnd].filter(Boolean).join(' ')}
                  color={look.color}
                  style={{ gridColumn: `${bar.startCol + 1} / ${bar.endCol + 2}`, gridRow: bar.lane + 2 }}
                  label={bar.ev.title}
                  selected={bar.ev.id === selectedEventId}
                  onPress={onEventPress ? el => onEventPress(bar.ev, el) : undefined}
                >
                  {bar.ev.title}
                </CalendarEventChip>
              );
            })}
            {week.perDay.map((plan, i) => {
              const barRows = week.bars.length === 0 ? 0 : Math.max(...week.bars.map(b => b.lane)) + 1;
              return (
                <DayLines
                  key={week.days[i]}
                  plan={plan}
                  col={i + 1}
                  firstRow={barRows + 2}
                  fmt={fmt}
                  lookFor={lookFor}
                  showTimes={showTimes}
                  onEventPress={onEventPress}
                  selectedEventId={selectedEventId}
                  moreLabel={(count: number) => t('panel.widget.calendar.moreCount', { count })}
                  onMorePress={onMorePress ? el => onMorePress(week.days[i], el) : undefined}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function DayLines({
  plan, col, firstRow, fmt, lookFor, showTimes, onEventPress, selectedEventId, moreLabel, onMorePress,
}: {
  plan: { lines: CalEvent[]; more: number };
  col: number;
  firstRow: number;
  fmt: CalendarFormat;
  lookFor: (id: string) => CalendarLook;
  showTimes: boolean;
  onEventPress?: (ev: CalEvent, el: HTMLElement) => void;
  selectedEventId?: string | null;
  moreLabel: (count: number) => string;
  onMorePress?: (el: HTMLElement) => void;
}) {
  return (
    <>
      {plan.lines.map((ev, k) => (
        <CalendarEventChip
          key={ev.id}
          className={styles.line}
          color={lookFor(ev.calendarId).color}
          style={{ gridColumn: col, gridRow: firstRow + k }}
          label={ev.title}
          selected={ev.id === selectedEventId}
          onPress={onEventPress ? el => onEventPress(ev, el) : undefined}
        >
          <i />
          {showTimes && <span className={styles.lineTime}>{fmt.time(ev.start)}</span>}
          <span className={styles.lineTitle}>{ev.title}</span>
        </CalendarEventChip>
      ))}
      {plan.more > 0 && (
        <CalendarEventChip
          className={`${styles.line} ${styles.more}`}
          color="transparent"
          style={{ gridColumn: col, gridRow: firstRow + plan.lines.length }}
          label={moreLabel(plan.more)}
          onPress={onMorePress}
        >
          {moreLabel(plan.more)}
        </CalendarEventChip>
      )}
    </>
  );
}
