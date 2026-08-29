import { useEffect, useMemo, useState } from 'react';
import type { WidgetProps } from '../types';
import { widgetLayoutSize, type PanelWidgetSize } from '../../types';
import { useTranslation } from '../../../lib/i18n';
import { buildMonthCells, resolveWeekStart, weekdayInitials, type WeekStartConfig } from './calendar';
import styles from './CalendarWidget.module.scss';

/**
 * Calendar widget. Two views, chosen by `config.showGrid`:
 *   false (default) - a glanceable date card (weekday / big day number / month).
 *   true            - the month grid, with today circled.
 * The grid always shows the current month; the tile is non-interactive so it
 * works identically on touch and display-only (Q60) surfaces.
 */
export function CalendarWidget({ widget }: WidgetProps) {
  const { language } = useTranslation();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // A calendar only rolls at the day boundary; a minute tick catches midnight
    // without a per-second wakeup.
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const showGrid = (widget.config?.showGrid as boolean | undefined) ?? false;
  const weekStartCfg = (widget.config?.weekStart as WeekStartConfig | undefined) ?? 'auto';

  const size = widgetLayoutSize(widget.size);
  if (!showGrid) return <DateCard now={now} locale={language} size={size} />;
  return (
    <MonthView
      now={now}
      locale={language}
      size={size}
      weekStart={resolveWeekStart(weekStartCfg, language)}
    />
  );
}

function DateCard({ now, locale, size }: { now: Date; locale: string; size: PanelWidgetSize }) {
  // Narrow portrait tiles can't fit a long weekday name next to the hero number.
  const narrow = size === '2x2' || size === '2x4';
  const weekday = new Intl.DateTimeFormat(locale, { weekday: narrow ? 'short' : 'long' }).format(now);
  const day = new Intl.DateTimeFormat(locale, { day: 'numeric' }).format(now);
  const monthYear = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(now);
  return (
    <div className={`${styles.card} ${styles[`s-${size}`]}`}>
      <div className={styles.weekday}>{weekday}</div>
      <div className={styles.day}>{day}</div>
      <div className={styles.monthYear}>{monthYear}</div>
    </div>
  );
}

function MonthView({
  now, locale, size, weekStart,
}: { now: Date; locale: string; size: PanelWidgetSize; weekStart: 0 | 1 }) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const todayDay = now.getDate();
  const cells = useMemo(() => buildMonthCells(year, month, weekStart), [year, month, weekStart]);
  const initials = useMemo(() => weekdayInitials(locale, weekStart), [locale, weekStart]);
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

  return (
    <div className={`${styles.month} ${styles[`s-${size}`]}`}>
      {showAside && (
        <div className={styles.aside}>
          <DateCard now={now} locale={locale} size="2x2" />
        </div>
      )}
      <div className={styles.calBody}>
        {showHeader && <div className={styles.header}>{headerLabel}</div>}
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
            const cls = [styles.cell, isWeekend ? styles.weekend : '', c.day === todayDay ? styles.today : '']
              .filter(Boolean).join(' ');
            return (
              <span key={i} className={cls}>
                <span className={styles.dayNum}>{c.day}</span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default CalendarWidget;
