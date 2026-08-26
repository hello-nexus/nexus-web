import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { resolveHour12, type TimeFormat } from '../../../lib/units';
import { formatDuration } from '../../../lib/formatDuration';
import * as monitoringStore from '../../../lib/monitoringStore';
import { useScreenTime } from '../../../hooks/useScreenTime';
import { fetchService } from '../../../api/service';
import { DatePicker } from '../../common/DatePicker/DatePicker';
import { HoverTooltip } from '../../common/HoverTooltip/HoverTooltip';
import {
  deleteScreenTimeApp,
  useScreenTimeApp,
  useScreenTimeDay,
  useScreenTimeHour,
  useScreenTimeRange,
  type DayBreakdown,
  type DayTotal,
} from '../../../hooks/useScreenTimeBrowse';
import styles from './ScreenTimeBrowse.module.scss';

export const SCREEN_TIME_MODES = ['day', 'week', 'month', 'app'] as const;
export type ScreenTimeMode = typeof SCREEN_TIME_MODES[number];

interface ScreenTimeBrowseProps {
  mode: ScreenTimeMode;
  onModeChange: (mode: ScreenTimeMode) => void;
}

export function ScreenTimeBrowse({ mode, onModeChange }: ScreenTimeBrowseProps) {
  const [date, setDate] = useState<string>(todayIso());
  const [appName, setAppName] = useState<string>('');

  const goToApp = (name: string) => {
    setAppName(name);
    onModeChange('app');
  };

  return (
    <div className={styles.root}>
      {mode === 'day' && (
        <DayPanel date={date} setDate={setDate} onAppClick={goToApp} />
      )}
      {mode === 'week' && (
        <WeekPanel
          onPickDay={d => { setDate(d); onModeChange('day'); }}
          onPickApp={goToApp}
        />
      )}
      {mode === 'month' && (
        <MonthPanel
          onPickDay={d => { setDate(d); onModeChange('day'); }}
        />
      )}
      {mode === 'app' && (
        <AppPanel
          name={appName}
          onPickName={setAppName}
          onBack={() => onModeChange('day')}
        />
      )}
    </div>
  );
}

// Hour-of-day label for the usage chart. The bars are whole hours, so this
// prints the hour alone rather than a wall-clock time with minutes.
function hourLabel(hour: number, timeFormat: TimeFormat): string {
  if (!resolveHour12(timeFormat)) return `${String(hour).padStart(2, '0')}:00`;
  const at = new Date(2000, 0, 1, hour);
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', hour12: true }).format(at);
}

function DayPanel({ date, setDate, onAppClick }: {
  date: string;
  setDate: (d: string) => void;
  onAppClick: (name: string) => void;
}) {
  const { t } = useTranslation();
  const { timeFormat } = useUnitPrefs();
  const { data: day } = useScreenTimeDay(date);
  const yesterdayIso = useMemo(() => addDays(date, -1), [date]);
  const { data: yesterday } = useScreenTimeDay(yesterdayIso);
  const live = useScreenTime();
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const hourApps = useScreenTimeHour(date, selectedHour);

  const isToday = date === todayIso();
  const merged = isToday ? mergeLiveIntoDay(day, live) : day;
  const delta = merged.totalMs - yesterday.totalMs;
  const max = Math.max(...merged.hourlyMs, 1);

  const apps = selectedHour === null ? merged.apps : hourApps;

  return (
    <>
      <DateNav date={date} setDate={setDate} />

      <div className={styles.summaryCard}>
        <div className={styles.summaryTotal}>
          <div className={styles.summaryValue}>{formatDuration(merged.totalMs)}</div>
          <div className={styles.summarySub}>{t('screentime.totalTime')}</div>
        </div>
        <div className={styles.summaryStats}>
          <div className={styles.statBlock}>
            <div className={styles.statValue}>{merged.pickups}</div>
            <div className={styles.statLabel}>{t('screentime.pickups')}</div>
          </div>
          {!isToday && (
            <div className={styles.statBlock}>
              <div className={delta >= 0 ? styles.statDeltaUp : styles.statDeltaDown}>
                {delta === 0 ? '0' : (delta > 0 ? '+' : '') + formatDuration(Math.abs(delta))}
              </div>
              <div className={styles.statLabel}>{t('screentime.vsPrev')}</div>
            </div>
          )}
        </div>
      </div>

      <div className={styles.hourlyCard}>
        <div className={styles.cardTitle}>
          {t('screentime.hourly')}
          {selectedHour !== null && (
            <button type="button" className={styles.clearFilter}
              onClick={() => setSelectedHour(null)}>
              {t('screentime.hourFilterClear')}
            </button>
          )}
        </div>
        <div className={styles.hourlyChart}>
          {merged.hourlyMs.map((ms, h) => (
            <HoverTooltip key={h} title={hourLabel(h, timeFormat)} body={formatDuration(ms)} side="top">
              <button type="button"
                className={selectedHour === h ? styles.hourBarActive : styles.hourBar}
                onClick={() => setSelectedHour(selectedHour === h ? null : h)}>
                <div className={styles.hourBarFill}
                  style={{ height: `${Math.max(2, (ms / max) * 100)}%` }} />
              </button>
            </HoverTooltip>
          ))}
        </div>
        <div className={styles.hourlyAxis}>
          {[0, 6, 12, 18, 23].map(h => <span key={h}>{hourLabel(h, timeFormat)}</span>)}
        </div>
      </div>

      <div className={styles.appsCard}>
        <div className={styles.cardTitle}>
          {selectedHour !== null
            ? t('screentime.hourFilter', { hour: hourLabel(selectedHour, timeFormat) })
            : t('screentime.appsList')}
        </div>
        {apps.length === 0 ? (
          <div className={styles.empty}>{t('screentime.noData')}</div>
        ) : (
          <AppsList apps={apps} onAppClick={onAppClick} />
        )}
      </div>
    </>
  );
}

function WeekPanel({ onPickDay, onPickApp }: {
  onPickDay: (d: string) => void;
  onPickApp: (name: string) => void;
}) {
  const { t } = useTranslation();
  const today = todayIso();
  const fromIso = addDays(today, -6);
  const { data: range } = useScreenTimeRange(fromIso, today);

  const days = useMemo(() => fillRange(fromIso, today, range), [fromIso, today, range]);
  const weekTotal = days.reduce((s, d) => s + d.totalMs, 0);
  const max = Math.max(...days.map(d => d.totalMs), 1);
  const dailyAvg = Math.round(weekTotal / 7);

  return (
    <>
      <div className={styles.summaryCard}>
        <div className={styles.summaryTotal}>
          <div className={styles.summaryValue}>{formatDuration(weekTotal)}</div>
          <div className={styles.summarySub}>{t('screentime.weekTotal')}</div>
        </div>
        <div className={styles.summaryStats}>
          <div className={styles.statBlock}>
            <div className={styles.statValue}>{formatDuration(dailyAvg)}</div>
            <div className={styles.statLabel}>{t('screentime.weekAverage')}</div>
          </div>
        </div>
      </div>

      <div className={styles.weekCard}>
        <div className={styles.cardTitle}>{t('screentime.weekTitle')}</div>
        <div className={styles.weekChart}>
          {days.map(d => (
            <HoverTooltip key={d.date} title={d.date} body={formatDuration(d.totalMs)} side="top">
              <button type="button" className={styles.weekBar}
                onClick={() => onPickDay(d.date)}>
                <div className={styles.weekBarFill}
                  style={{ height: `${Math.max(2, (d.totalMs / max) * 100)}%` }} />
                <div className={styles.weekBarLabel}>{shortDayLabel(d.date)}</div>
              </button>
            </HoverTooltip>
          ))}
        </div>
      </div>

      <RangeAppsList from={fromIso} to={today} onAppClick={onPickApp} />
    </>
  );
}

function MonthPanel({ onPickDay }: { onPickDay: (d: string) => void }) {
  const { t } = useTranslation();
  const today = todayIso();
  const fromIso = addDays(today, -29);
  const { data: range } = useScreenTimeRange(fromIso, today);

  const days = useMemo(() => fillRange(fromIso, today, range), [fromIso, today, range]);
  const monthTotal = days.reduce((s, d) => s + d.totalMs, 0);
  const max = Math.max(...days.map(d => d.totalMs), 1);

  return (
    <>
      <div className={styles.summaryCard}>
        <div className={styles.summaryTotal}>
          <div className={styles.summaryValue}>{formatDuration(monthTotal)}</div>
          <div className={styles.summarySub}>{t('screentime.monthTitle')}</div>
        </div>
      </div>

      <div className={styles.monthCard}>
        <div className={styles.cardTitle}>{t('screentime.monthTitle')}</div>
        <div className={styles.heatmap}>
          {days.map(d => {
            const ratio = d.totalMs / max;
            return (
              <HoverTooltip key={d.date} title={d.date} body={formatDuration(d.totalMs)} side="top">
                <button type="button" className={styles.heatCell}
                  onClick={() => onPickDay(d.date)}
                  style={{ opacity: 0.15 + ratio * 0.85 }}>
                  <span className={styles.heatCellLabel}>{Number(d.date.slice(8))}</span>
                </button>
              </HoverTooltip>
            );
          })}
        </div>
        <div className={styles.heatmapLegend}>
          <span>{t('screentime.heatmapLess')}</span>
          <div className={styles.heatmapGradient} />
          <span>{t('screentime.heatmapMore')}</span>
        </div>
      </div>
    </>
  );
}

function AppPanel({ name, onPickName, onBack }: {
  name: string;
  onPickName: (n: string) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const today = todayIso();
  const fromIso = addDays(today, -6);
  const { data: history } = useScreenTimeApp(name, fromIso, today);

  const daily = history?.daily;
  const filled = useMemo(() => fillRange(fromIso, today, daily ?? []), [fromIso, today, daily]);

  if (!name) {
    return (
      <div className={styles.empty}>
        <p>{t('screentime.appPickPrompt')}</p>
      </div>
    );
  }

  const max = Math.max(...filled.map(d => d.totalMs), 1);
  const total = history?.totalMs ?? 0;
  const avg = filled.length > 0 ? Math.round(total / filled.length) : 0;

  const onDelete = async () => {
    if (!confirm(t('screentime.appDeleteConfirm', { name }))) return;
    await deleteScreenTimeApp(name);
    onPickName('');
    onBack();
  };

  return (
    <>
      <div className={styles.appHeader}>
        <button type="button" className={styles.backBtn} onClick={onBack}>
          {t('screentime.appBack')}
        </button>
        <div className={styles.appName}>{name}</div>
      </div>

      <div className={styles.appStatsRow}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{formatDuration(total)}</div>
          <div className={styles.statLabel}>{t('screentime.appLast7')}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{formatDuration(avg)}</div>
          <div className={styles.statLabel}>{t('screentime.appDailyAvg')}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{formatDuration(history?.longestSessionMs ?? 0)}</div>
          <div className={styles.statLabel}>{t('screentime.appLongestSession')}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{history?.totalPickups ?? 0}</div>
          <div className={styles.statLabel}>{t('screentime.appPickups')}</div>
        </div>
      </div>

      <div className={styles.appChartCard}>
        <div className={styles.cardTitle}>{t('screentime.appLast7')}</div>
        <div className={styles.weekChart}>
          {filled.map(d => (
            <HoverTooltip key={d.date} title={d.date} body={formatDuration(d.totalMs)} side="top">
              <div className={styles.weekBar}>
                <div className={styles.weekBarFill}
                  style={{ height: `${Math.max(2, (d.totalMs / max) * 100)}%` }} />
                <div className={styles.weekBarLabel}>{shortDayLabel(d.date)}</div>
              </div>
            </HoverTooltip>
          ))}
        </div>
      </div>

      <button type="button" className={styles.deleteAppBtn} onClick={onDelete}>
        {t('screentime.appDeleteData')}
      </button>
    </>
  );
}

function DateNav({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  const { t } = useTranslation();
  const today = todayIso();
  const isToday = date === today;
  const labelDate = formatLongDate(date);

  return (
    <div className={styles.dateNav}>
      <button type="button" className={styles.dateNavBtn}
        onClick={() => setDate(addDays(date, -1))}
        aria-label={t('screentime.dateNav.prev')}>
        ‹
      </button>
      <div className={styles.dateNavLabel}>
        {isToday ? t('screentime.dateNav.today') : labelDate}
        {!isToday && <span className={styles.dateNavSubLabel}> · {labelDate}</span>}
      </div>
      <button type="button" className={styles.dateNavBtn}
        onClick={() => setDate(addDays(date, 1))}
        disabled={isToday}
        aria-label={t('screentime.dateNav.next')}>
        ›
      </button>
      <DatePicker value={date} max={today} onChange={setDate}
        ariaLabel={t('screentime.dateNav.prev')} />
    </div>
  );
}

function AppsList({ apps, onAppClick }: {
  apps: { name: string; totalMs: number }[];
  onAppClick: (name: string) => void;
}) {
  const max = Math.max(...apps.map(a => a.totalMs), 1);
  return (
    <div className={styles.appsList}>
      {apps.map(a => (
        <button key={a.name} type="button" className={styles.appRow}
          onClick={() => onAppClick(a.name)}>
          <div className={styles.appSwatch}
            style={{ background: monitoringStore.colorFor(a.name) }} />
          <div className={styles.appNameCell}>{a.name}</div>
          <div className={styles.appBarCell}>
            <div className={styles.appBar}
              style={{
                width: `${(a.totalMs / max) * 100}%`,
                background: monitoringStore.colorFor(a.name),
              }} />
          </div>
          <div className={styles.appTimeCell}>{formatDuration(a.totalMs)}</div>
        </button>
      ))}
    </div>
  );
}

function RangeAppsList({ from, to, onAppClick }: {
  from: string;
  to: string;
  onAppClick: (name: string) => void;
}) {
  const { t } = useTranslation();
  const [agg, setAgg] = useState<{ name: string; totalMs: number }[]>([]);

  useEffect(() => {
    let cancelled = false;
    aggregateAppsAcrossRange(from, to).then(r => { if (!cancelled) setAgg(r); });
    return () => { cancelled = true; };
  }, [from, to]);

  if (agg.length === 0) {
    return null;
  }

  return (
    <div className={styles.appsCard}>
      <div className={styles.cardTitle}>{t('screentime.appsList')}</div>
      <AppsList apps={agg} onAppClick={onAppClick} />
    </div>
  );
}

async function aggregateAppsAcrossRange(from: string, to: string) {
  if (from > to) return [];
  const days: string[] = [];
  let cur = from;
  while (cur <= to) {
    days.push(cur);
    cur = addDays(cur, 1);
  }
  const totals = new Map<string, number>();
  await Promise.all(days.map(async d => {
    const res = await fetchService<DayBreakdown>(`/api/screentime/day/${d}`);
    if (!res) return;
    for (const a of res.apps) {
      totals.set(a.name, (totals.get(a.name) ?? 0) + a.totalMs);
    }
  }));
  return Array.from(totals.entries())
    .map(([name, totalMs]) => ({ name, totalMs }))
    .sort((a, b) => b.totalMs - a.totalMs);
}

function mergeLiveIntoDay(day: DayBreakdown, live: ReturnType<typeof useScreenTime>): DayBreakdown {
  const focus = live.focus;
  if (!focus) return day;
  const ongoingMs = focus.today.total;
  if (ongoingMs <= 0) return day;
  const result: DayBreakdown = {
    date: day.date,
    totalMs: day.totalMs + ongoingMs,
    pickups: day.pickups + 1,
    apps: day.apps.map(a => ({ ...a })),
    hourlyMs: [...day.hourlyMs],
  };
  const existing = result.apps.find(a => a.name === focus.name);
  if (existing) {
    existing.totalMs += ongoingMs;
  } else {
    result.apps.push({ name: focus.name, totalMs: ongoingMs });
  }
  result.apps.sort((a, b) => b.totalMs - a.totalMs);
  const nowHour = new Date().getHours();
  result.hourlyMs[nowHour] += ongoingMs;
  return result;
}

function fillRange(from: string, to: string, rows: DayTotal[]): DayTotal[] {
  if (from > to) return [];
  const map = new Map(rows.map(r => [r.date, r]));
  const out: DayTotal[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(map.get(cur) ?? { date: cur, totalMs: 0, pickups: 0 });
    cur = addDays(cur, 1);
  }
  return out;
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDays(iso: string, n: number) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function pad2(n: number) { return n < 10 ? `0${n}` : `${n}`; }

function formatLongDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function shortDayLabel(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: 'narrow' });
}

