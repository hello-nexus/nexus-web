import { useMemo } from 'react';
import styles from './MonthGrid.module.scss';

/** Local midnights of the weeks (up to six) that cover a month, padded with the neighbouring months' days. */
export function monthWeeks(year: number, month: number, weekStart: 0 | 1): number[][] {
  const lead = (new Date(year, month, 1).getDay() - weekStart + 7) % 7;
  const weeks: number[][] = [];
  for (let w = 0; w < 6; w++) {
    const row = Array.from({ length: 7 }, (_, i) => new Date(year, month, 1 - lead + w * 7 + i).getTime());
    if (w > 0 && new Date(row[0]).getMonth() !== month) break;
    weeks.push(row);
  }
  return weeks;
}

export interface MonthGridProps {
  year: number;
  /** 0-based. */
  month: number;
  /** 0 = Sunday first, 1 = Monday first. */
  weekStart: 0 | 1;
  /** BCP 47 tag for the weekday initials and day numbers; the browser default when absent. */
  locale?: string;
  isSelected: (day: number) => boolean;
  isToday: (day: number) => boolean;
  isDisabled?: (day: number) => boolean;
  /** Tint a whole week row (week-based views). */
  highlightWeek?: (week: readonly number[]) => boolean;
  onPick: (day: number) => void;
  /** Day numbers in the monospace face (DatePicker); the inherited face otherwise. */
  monoDays?: boolean;
}

/**
 * The weekday header and day cells of a month: the one grid under DatePicker's popup and MiniMonth. Days arrive
 * and leave as local-midnight epoch ms; the caller decides what selected, today and disabled mean.
 */
export function MonthGrid({ year, month, weekStart, locale, isSelected, isToday, isDisabled, highlightWeek, onPick, monoDays }: MonthGridProps) {
  const weeks = useMemo(() => monthWeeks(year, month, weekStart), [year, month, weekStart]);
  const initials = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2023, 0, 1 + weekStart + i)));
  }, [locale, weekStart]);
  const dayNumber = useMemo(() => new Intl.DateTimeFormat(locale, { day: 'numeric' }), [locale]);

  return (
    <>
      <div className={styles.weekdays}>
        {initials.map((w, i) => <span key={i}>{w}</span>)}
      </div>
      {weeks.map(row => (
        <div key={row[0]} className={`${styles.row} ${highlightWeek?.(row) ? styles.rowHighlighted : ''}`}>
          {row.map(day => {
            const selected = isSelected(day);
            const disabled = isDisabled?.(day) === true;
            const cls = [
              styles.cell,
              monoDays ? styles.mono : '',
              new Date(day).getMonth() !== month ? styles.out : '',
              isToday(day) && !selected ? styles.today : '',
              selected ? styles.selected : '',
              disabled ? styles.disabled : '',
            ].filter(Boolean).join(' ');
            return (
              <button key={day} type="button" className={cls} disabled={disabled} aria-pressed={selected} onClick={() => onPick(day)}>
                {dayNumber.format(day)}
              </button>
            );
          })}
        </div>
      ))}
    </>
  );
}
