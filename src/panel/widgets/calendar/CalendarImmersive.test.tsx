import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarSourceDto } from '../../../api/calendar';
import type { PanelSurface, PanelWidget } from '../../types';
import { normalizeEvent, type CalEvent } from './calendarEvents';
import { allDayEvent, timedEvent } from './calendarPreviewData';
import { CalendarImmersive } from './CalendarImmersive';

const store = vi.hoisted(() => ({ events: [] as CalEvent[], ranges: [] as [number, number][] }));

vi.mock('../../../hooks/useCalendar', () => ({
  useCalendarSources: () => ({ sources: [{ id: 'work', kind: 'ics', name: 'Work', color: '#8b7cff', host: null, lastSyncedAt: null, status: 'ok', error: null } as CalendarSourceDto], loaded: true }),
  useCalendarEvents: (from: number, to: number) => {
    store.ranges.push([from, to]);
    return { events: store.events, syncedAt: null, loaded: true };
  },
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => (params && Object.keys(params).length > 0 ? `${key}|${Object.values(params).join('|')}` : key),
    language: 'en',
  }),
}));

const NOW = new Date(2026, 10, 17, 14, 35).getTime();
const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m).getTime();

function widget(config?: Record<string, unknown>): PanelWidget {
  return { id: 'w', type: 'calendar', size: '4x4', col: 0, row: 0, config } as PanelWidget;
}

function renderImmersive(surface: PanelSurface, config?: Record<string, unknown>, deviceTouch?: boolean) {
  return render(<CalendarImmersive widget={widget(config)} surface={surface} deviceTouch={deviceTouch} />);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'setTimeout', 'Date'] });
  vi.setSystemTime(NOW);
  store.ranges = [];
  store.events = [
    normalizeEvent(timedEvent('1', 'work', 'Design review', at(17, 14), at(17, 15))),
    normalizeEvent(timedEvent('2', 'work', 'Sprint planning', at(18, 10), at(18, 11))),
    normalizeEvent(allDayEvent('3', 'work', 'Launch week', at(16, 12), at(18, 12))),
  ];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CalendarImmersive', () => {
  it('shows the view switcher, Today and arrows on a touch panel', () => {
    renderImmersive('y70');
    expect(screen.getByRole('group', { name: 'panel.widget.calendar.view.label' })).toBeTruthy();
    expect(screen.getByText('panel.widget.calendar.today')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'panel.widget.calendar.prev' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'panel.widget.calendar.next' })).toBeTruthy();
  });

  it('hides every control on a display-only panel and shows the configured view', () => {
    renderImmersive('q60', { immersiveView: 'list' });
    expect(screen.queryByRole('group', { name: 'panel.widget.calendar.view.label' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'panel.widget.calendar.today' })).toBeNull();
    expect(screen.getByText('Design review')).toBeTruthy();
  });

  it('shows no controls on a monitor without a digitizer but does with one', () => {
    const { unmount } = renderImmersive('monitor', undefined, false);
    expect(screen.queryByText('panel.widget.calendar.today')).toBeNull();
    unmount();
    renderImmersive('monitor', undefined, true);
    expect(screen.getByText('panel.widget.calendar.today')).toBeTruthy();
  });

  it('defaults to Week in landscape and honours the configured view', () => {
    renderImmersive('y70');
    expect(screen.getByRole('button', { name: 'panel.widget.calendar.view.week' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('switches views and steps the range', () => {
    renderImmersive('y70', { immersiveView: 'day' });
    expect(screen.getByRole('button', { name: 'panel.widget.calendar.view.day' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'panel.widget.calendar.next' }));
    const last = store.ranges[store.ranges.length - 1];
    expect(last[0]).toBe(new Date(2026, 10, 18).getTime());
    fireEvent.click(screen.getByText('panel.widget.calendar.today'));
    expect(store.ranges[store.ranges.length - 1][0]).toBe(new Date(2026, 10, 17).getTime());
    fireEvent.click(screen.getByRole('button', { name: 'panel.widget.calendar.view.month' }));
    expect(screen.getByRole('button', { name: 'panel.widget.calendar.view.month' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('steps a month at a time in the month view', () => {
    renderImmersive('y70', { immersiveView: 'month' });
    fireEvent.click(screen.getByRole('button', { name: 'panel.widget.calendar.next' }));
    expect(screen.getByText('December')).toBeTruthy();
  });

  it('lists upcoming events grouped by day with "Now" on the current one', () => {
    renderImmersive('y70', { immersiveView: 'list' });
    expect(screen.getByText('panel.widget.calendar.now')).toBeTruthy();
    expect(screen.getByText('panel.widget.calendar.tomorrow')).toBeTruthy();
    expect(screen.getAllByText('Launch week')).toHaveLength(2);
  });

  it('rolls a display-only panel over at midnight instead of freezing at mount', () => {
    vi.setSystemTime(new Date(2026, 10, 17, 23, 58).getTime());
    renderImmersive('q60', { immersiveView: 'day' });
    expect(screen.getByText('Tuesday, November 17')).toBeTruthy();
    act(() => { vi.setSystemTime(new Date(2026, 10, 18, 0, 2).getTime()); vi.advanceTimersByTime(60_000); });
    expect(screen.getByText('Wednesday, November 18')).toBeTruthy();
  });

  it('rolls a touch panel over at midnight while it still follows today, but not after the user navigated', () => {
    vi.setSystemTime(new Date(2026, 10, 17, 23, 58).getTime());
    const followed = renderImmersive('y70', { immersiveView: 'day' });
    act(() => { vi.setSystemTime(new Date(2026, 10, 18, 0, 2).getTime()); vi.advanceTimersByTime(60_000); });
    expect(screen.getByText('Wednesday, November 18')).toBeTruthy();
    followed.unmount();

    vi.setSystemTime(new Date(2026, 10, 17, 23, 58).getTime());
    renderImmersive('y70', { immersiveView: 'day' });
    fireEvent.click(screen.getByRole('button', { name: 'panel.widget.calendar.next' }));
    expect(screen.getByText('Wednesday, November 18')).toBeTruthy();
    act(() => { vi.setSystemTime(new Date(2026, 10, 18, 0, 2).getTime()); vi.advanceTimersByTime(60_000); });
    expect(screen.getByText('Wednesday, November 18')).toBeTruthy();
  });

  it('puts the day label above its events when the list is narrow, and keeps two columns when wide', () => {
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get');
    const height = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(700);
    width.mockReturnValue(380);
    const narrow = renderImmersive('y70', { immersiveView: 'list' });
    expect(narrow.container.querySelector('[class*="narrow"]')).not.toBeNull();
    narrow.unmount();
    width.mockReturnValue(800);
    const wide = renderImmersive('y70', { immersiveView: 'list' });
    expect(wide.container.querySelector('[class*="narrow"]')).toBeNull();
    width.mockRestore();
    height.mockRestore();
  });

  it('says so when nothing is coming up', () => {
    store.events = [];
    renderImmersive('y70', { immersiveView: 'list' });
    expect(screen.getByText('panel.widget.calendar.noUpcoming')).toBeTruthy();
  });

  it('draws events in the Day timeline with the all-day lane', () => {
    renderImmersive('y70', { immersiveView: 'day' });
    expect(screen.getByText('Design review')).toBeTruthy();
    expect(screen.getByText('Launch week')).toBeTruthy();
    expect(screen.getByText('panel.widget.calendar.allDay')).toBeTruthy();
  });
});
