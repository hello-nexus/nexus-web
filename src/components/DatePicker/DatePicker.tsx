import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '../../lib/i18n';
import styles from './DatePicker.module.scss';

const POPUP_MIN_WIDTH = 260;
const VIEWPORT_MARGIN = 8;

interface DatePickerProps {
  /** ISO date string YYYY-MM-DD. */
  value: string;
  /** Upper bound (inclusive), ISO YYYY-MM-DD. Defaults to no limit. */
  max?: string;
  /** Lower bound (inclusive), ISO YYYY-MM-DD. Defaults to no limit. */
  min?: string;
  onChange: (iso: string) => void;
  /** Accessible label for the trigger. */
  ariaLabel?: string;
}

export function DatePicker({ value, max, min, onChange, ariaLabel }: DatePickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(value.slice(0, 7));
  const [alignRight, setAlignRight] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setViewMonth(value.slice(0, 7));
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setAlignRight(false);
      return;
    }
    const compute = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      setAlignRight(rect.left + POPUP_MIN_WIDTH > window.innerWidth - VIEWPORT_MARGIN);
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [open]);

  const grid = useMemo(() => buildGrid(viewMonth), [viewMonth]);
  const todayIso = useMemo(() => isoToday(), []);

  const shiftMonth = (delta: number) => {
    const [y, m] = viewMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setViewMonth(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`);
  };

  const pick = (iso: string) => {
    if (max && iso > max) return;
    if (min && iso < min) return;
    onChange(iso);
    setOpen(false);
  };

  const displayLabel = useMemo(() => formatDisplay(value), [value]);
  const monthLabel = useMemo(() => formatMonth(viewMonth), [viewMonth]);
  const weekdays = useMemo(() => getWeekdayLabels(), []);

  const canGoNext = !max || monthEnd(viewMonth) < max || viewMonth < max.slice(0, 7);
  const canGoPrev = !min || monthStart(viewMonth) > min || viewMonth > min.slice(0, 7);

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(v => !v)}
        aria-label={ariaLabel}
        aria-expanded={open}
      >
        <span className={styles.triggerText}>{displayLabel}</span>
        <svg className={styles.triggerIcon} width="14" height="14" viewBox="0 0 14 14"
          fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1.5" y="2.5" width="11" height="10" rx="1.5" />
          <line x1="1.5" y1="5" x2="12.5" y2="5" />
          <line x1="4" y1="1" x2="4" y2="4" />
          <line x1="10" y1="1" x2="10" y2="4" />
        </svg>
      </button>

      {open && (
        <div
          className={`${styles.popup}${alignRight ? ` ${styles.popupAlignRight}` : ''}`}
          role="dialog"
          aria-label={t('datepicker.popup')}
        >
          <div className={styles.header}>
            <button type="button" className={styles.navBtn}
              onClick={() => shiftMonth(-1)} disabled={!canGoPrev}
              aria-label={t('datepicker.prevMonth')}>‹</button>
            <div className={styles.monthLabel}>{monthLabel}</div>
            <button type="button" className={styles.navBtn}
              onClick={() => shiftMonth(1)} disabled={!canGoNext}
              aria-label={t('datepicker.nextMonth')}>›</button>
          </div>

          <div className={styles.weekdays}>
            {weekdays.map(w => <div key={w} className={styles.weekday}>{w}</div>)}
          </div>

          <div className={styles.grid}>
            {grid.map((cell, i) => {
              const isSelected = cell.iso === value;
              const isToday = cell.iso === todayIso;
              const isDisabled = (!!max && cell.iso > max) || (!!min && cell.iso < min);
              const classes = [
                cell.inMonth ? styles.cell : styles.cellOut,
                isSelected ? styles.cellSelected : '',
                isToday && !isSelected ? styles.cellToday : '',
                isDisabled ? styles.cellDisabled : '',
              ].filter(Boolean).join(' ');
              return (
                <button key={i} type="button"
                  className={classes}
                  onClick={() => pick(cell.iso)}
                  disabled={isDisabled}>
                  {cell.day}
                </button>
              );
            })}
          </div>

          <div className={styles.footer}>
            <button type="button" className={styles.todayBtn}
              onClick={() => pick(todayIso)}
              disabled={!!(max && todayIso > max) || !!(min && todayIso < min)}>
              {t('datepicker.today')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface Cell {
  iso: string;
  day: number;
  inMonth: boolean;
}

function buildGrid(ym: string): Cell[] {
  const [y, m] = ym.split('-').map(Number);
  const firstOfMonth = new Date(y, m - 1, 1);
  const firstDow = firstOfMonth.getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const prevMonthDays = new Date(y, m - 1, 0).getDate();

  const cells: Cell[] = [];
  for (let i = firstDow - 1; i >= 0; i--) {
    const day = prevMonthDays - i;
    const pd = new Date(y, m - 2, day);
    cells.push({ iso: toIso(pd), day, inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ iso: `${y}-${pad2(m)}-${pad2(d)}`, day: d, inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1];
    const [ly, lm, ld] = last.iso.split('-').map(Number);
    const nd = new Date(ly, lm - 1, ld + 1);
    cells.push({ iso: toIso(nd), day: nd.getDate(), inMonth: false });
  }
  return cells;
}

function monthStart(ym: string) { return ym + '-01'; }
function monthEnd(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return `${y}-${pad2(m)}-${pad2(new Date(y, m, 0).getDate())}`;
}

function toIso(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function pad2(n: number) { return n < 10 ? `0${n}` : `${n}`; }

function formatDisplay(iso: string) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  const dt = new Date(y, m - 1, 1);
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
}

function getWeekdayLabels() {
  const base = new Date(2024, 0, 7);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push(d.toLocaleDateString(undefined, { weekday: 'narrow' }));
  }
  return out;
}
