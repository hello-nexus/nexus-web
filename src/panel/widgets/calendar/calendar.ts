export type WeekStartConfig = 'auto' | 'sunday' | 'monday';

export interface MonthCell {
  // Day-of-month number to render.
  day: number;
  // False for the leading/trailing days that belong to the adjacent month and
  // pad the grid out to whole weeks.
  inMonth: boolean;
}

// Languages in the app set whose calendars conventionally start the week on
// Sunday; every other supported language starts on Monday. Only seeds the
// 'auto' default - the user can override per widget. Q60's Chromium 83 has no
// Intl.Locale weekInfo, so the platform can't supply this.
const SUNDAY_FIRST_LANGS = new Set(['en', 'ja', 'ko', 'zh-CN', 'zh-TW', 'pt-BR']);

// 0 = Sunday, 1 = Monday.
export function resolveWeekStart(config: WeekStartConfig, language: string): 0 | 1 {
  if (config === 'sunday') return 0;
  if (config === 'monday') return 1;
  return SUNDAY_FIRST_LANGS.has(language) ? 0 : 1;
}

// Day cells for `month` (0-based) of `year`, padded with adjacent-month days so
// the grid is whole weeks (4-6 rows). weekStart: 0 = Sunday, 1 = Monday.
export function buildMonthCells(year: number, month: number, weekStart: 0 | 1): MonthCell[] {
  const firstDow = new Date(year, month, 1).getDay();
  const lead = (firstDow - weekStart + 7) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const cells: MonthCell[] = [];
  for (let i = lead - 1; i >= 0; i--) cells.push({ day: prevMonthDays - i, inMonth: false });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, inMonth: true });
  let trailing = 1;
  while (cells.length % 7 !== 0) cells.push({ day: trailing++, inMonth: false });
  return cells;
}

// Narrow weekday initials in `locale`, ordered from weekStart. 2023-01-01 is a
// Sunday, so + weekStart lands on the configured first column.
export function weekdayInitials(locale: string, weekStart: 0 | 1): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
  const out: string[] = [];
  for (let i = 0; i < 7; i++) out.push(fmt.format(new Date(2023, 0, 1 + weekStart + i)));
  return out;
}
