import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarSourceDto } from '../../../api/calendar';
import type { PanelWidget, PanelWidgetSize } from '../../types';
import { PanelPreviewProvider } from '../common/PanelPreviewContext';
import { normalizeEvent, type CalEvent } from './calendarEvents';
import { allDayEvent, timedEvent } from './calendarPreviewData';
import { CalendarWidget } from './CalendarWidget';

const store = vi.hoisted(() => ({
  sources: [] as CalendarSourceDto[],
  events: [] as CalEvent[],
  loaded: true,
  eventCalls: [] as boolean[],
}));

vi.mock('../../../hooks/useCalendar', () => ({
  useCalendarSources: (enabled = true) => {
    store.eventCalls.push(enabled);
    return { sources: store.sources, loaded: store.loaded };
  },
  useCalendarEvents: (_from: number, _to: number, _hidden: readonly string[], enabled = true) => {
    store.eventCalls.push(enabled);
    return { events: store.events, syncedAt: null, loaded: store.loaded };
  },
}));

vi.mock('../../../lib/i18n', () => {
  const t = (key: string, params?: Record<string, string | number>) => (params && Object.keys(params).length > 0
    ? `${key}|${Object.values(params).join('|')}`
    : key);
  return { useTranslation: () => ({ t, language: 'en' }) };
});

const source = (id: string, color: string): CalendarSourceDto => ({
  id, kind: 'ics', name: id, color, host: null, lastSyncedAt: null, status: 'ok', error: null,
});

function widget(size: PanelWidgetSize, config?: Record<string, unknown>): PanelWidget {
  return { id: 'w', type: 'calendar', size, col: 0, row: 0, config } as PanelWidget;
}

const NOW = new Date(2026, 10, 17, 14, 35).getTime();
const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m).getTime();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'setTimeout', 'Date'] });
  vi.setSystemTime(NOW);
  store.sources = [source('work', '#8b7cff'), source('home', '#ff9f0a')];
  store.events = [
    normalizeEvent(timedEvent('1', 'work', 'Design review', at(17, 14), at(17, 15))),
    normalizeEvent(timedEvent('2', 'home', 'Pick up Leo', at(17, 16), at(17, 16, 30))),
    normalizeEvent(timedEvent('3', 'work', 'Sprint planning', at(18, 10), at(18, 11))),
  ];
  store.loaded = true;
  store.eventCalls = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CalendarWidget views', () => {
  it('shows the date card and skips every fetch when the view is Date', () => {
    render(<CalendarWidget widget={widget('4x2')} />);
    expect(screen.getByText('November 2026')).toBeTruthy();
    expect(screen.queryByText('Design review')).toBeNull();
    expect(store.eventCalls.every(enabled => enabled === false)).toBe(true);
  });

  it('migrates a retired showGrid toggle to the month grid', () => {
    const { container } = render(<CalendarWidget widget={widget('4x2', { showGrid: true })} />);
    expect(container.querySelectorAll('[class*="cell"]').length).toBeGreaterThan(28);
  });

  it('lists the in-progress and upcoming events in Next event at 2x4', () => {
    render(<CalendarWidget widget={widget('2x4', { showEvents: true })} />);
    expect(screen.getByText('Design review')).toBeTruthy();
    expect(screen.getByText('Pick up Leo')).toBeTruthy();
    expect(screen.getByText('panel.widget.calendar.when.nowUntil|3:00 PM')).toBeTruthy();
  });

  it('fits only the lead event in the 2x2 tile', () => {
    render(<CalendarWidget widget={widget('2x2', { showEvents: true })} />);
    expect(screen.getByText('Design review')).toBeTruthy();
    expect(screen.queryByText('Pick up Leo')).toBeNull();
  });

  it('summarizes what is left on the round tile with its own count', () => {
    render(<CalendarWidget widget={widget('2x2round', { showEvents: true })} />);
    expect(screen.getByText('Design review')).toBeTruthy();
  });

  it('says there is nothing left and offers tomorrow when today is done', () => {
    vi.setSystemTime(at(17, 23, 30));
    render(<CalendarWidget widget={widget('4x2', { showEvents: true })} />);
    expect(screen.getByText('panel.widget.calendar.noMoreToday')).toBeTruthy();
    expect(screen.getByText('Sprint planning')).toBeTruthy();
  });

  it('shows the all-day event only when no timed event remains today', () => {
    store.events = [normalizeEvent(allDayEvent('a', 'work', 'Launch week', at(16, 12), at(18, 12))), ...store.events];
    render(<CalendarWidget widget={widget('4x2', { showEvents: true })} />);
    expect(screen.queryByText('Launch week')).toBeNull();
  });

  it('renders Up Next at 4x4 with today and tomorrow', () => {
    render(<CalendarWidget widget={widget('4x4', { showEvents: true })} />);
    expect(screen.getByText('Design review')).toBeTruthy();
    expect(screen.getByText('Sprint planning')).toBeTruthy();
    expect(screen.getByText('panel.widget.calendar.upNext')).toBeTruthy();
  });

  it('draws one dot per calendar, at most three, under month days', () => {
    store.events = [
      ...store.events,
      normalizeEvent(timedEvent('4', 'c3', 'x', at(17, 9), at(17, 10))),
      normalizeEvent(timedEvent('5', 'c4', 'y', at(17, 9), at(17, 10))),
    ];
    const { container } = render(<CalendarWidget widget={widget('4x2', { showGrid: true, showEvents: true })} />);
    const dotRows = Array.from(container.querySelectorAll('[class*="dots"]'));
    const counts = dotRows.map(row => row.children.length);
    expect(Math.max(...counts)).toBe(3);
  });

  it('hides the dots when the setting is off', () => {
    const { container } = render(<CalendarWidget widget={widget('4x2', { showGrid: true, showEvents: true, showDots: false })} />);
    expect(container.querySelectorAll('[class*="dots"]').length).toBe(0);
  });

  it('adds today\'s list under the 4x4 month grid', () => {
    render(<CalendarWidget widget={widget('4x4', { showGrid: true, showEvents: true })} />);
    expect(screen.getByText('Design review')).toBeTruthy();
    expect(screen.getByText('panel.widget.calendar.today')).toBeTruthy();
  });

  it('names an empty calendar set instead of claiming the day is free', () => {
    store.sources = [];
    store.events = [];
    render(<CalendarWidget widget={widget('4x2', { showEvents: true })} />);
    expect(screen.getByText('panel.widget.calendar.noCalendars')).toBeTruthy();
  });

  it('re-evaluates now on the minute tick', () => {
    render(<CalendarWidget widget={widget('2x2', { showEvents: true })} />);
    expect(screen.getByText('Design review')).toBeTruthy();
    act(() => { vi.setSystemTime(at(17, 15, 5)); vi.advanceTimersByTime(60_000); });
    expect(screen.queryByText('Design review')).toBeNull();
    expect(screen.getByText('Pick up Leo')).toBeTruthy();
  });
});

describe('CalendarWidget display toggles', () => {
  it('shows only the month grid, with no list at 4x4, when events are off', () => {
    const { container } = render(<CalendarWidget widget={widget('4x4', { showGrid: true, showEvents: false })} />);
    expect(screen.queryByText('Design review')).toBeNull();
    expect(screen.queryByText('panel.widget.calendar.today')).toBeNull();
    expect(container.querySelectorAll('[class*="dots"]').length).toBeGreaterThan(0);
  });

  it('keeps the dots independent of the event list', () => {
    const { container } = render(<CalendarWidget widget={widget('4x2', { showGrid: true, showEvents: false, showDots: false })} />);
    expect(container.querySelectorAll('[class*="dots"]').length).toBe(0);
  });

  it('shows the month grid without a list at sizes too small for one', () => {
    render(<CalendarWidget widget={widget('4x2', { showGrid: true, showEvents: true })} />);
    expect(screen.queryByText('Design review')).toBeNull();
  });
});

describe('CalendarWidget catalog preview and defaults', () => {
  const renderPreview = (config?: Record<string, unknown>) => {
    store.events = [];
    store.sources = [];
    return render(
      <PanelPreviewProvider value>
        <CalendarWidget widget={widget('4x2', config)} />
      </PanelPreviewProvider>,
    );
  };

  it('previews a default calendar as the date card, with no events and no fetch', () => {
    renderPreview();
    expect(screen.getByText('November 2026'.replace('November', new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date())).replace('2026', String(new Date().getFullYear())))).toBeTruthy();
    expect(screen.queryByText('Design review')).toBeNull();
    expect(store.eventCalls.every(enabled => enabled === false)).toBe(true);
  });

  it('previews the fixture events when events are switched on', () => {
    renderPreview({ showEvents: true });
    expect(screen.getByText('Design review')).toBeTruthy();
    expect(store.eventCalls.every(enabled => enabled === false)).toBe(true);
  });

  it('declares the date card as the default config of a newly added widget', async () => {
    const { calendarApp } = await import('./index');
    expect(calendarApp.meta.defaultConfig?.('4x2')).toEqual({ showGrid: false, showEvents: false });
  });
});
