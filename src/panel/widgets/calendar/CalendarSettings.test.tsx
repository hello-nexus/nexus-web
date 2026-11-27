import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarSourceDto } from '../../../api/calendar';
import type { PanelSurface, PanelWidget } from '../../types';
import { CalendarSettings } from './CalendarSettings';

const hooks = vi.hoisted(() => ({
  sources: [] as CalendarSourceDto[],
  refreshNow: vi.fn(() => Promise.resolve()),
  setRefreshMinutes: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../../hooks/useCalendar', () => ({
  useCalendarSources: () => ({ sources: hooks.sources, loaded: true }),
  useCalendarSettings: () => ({
    settings: { refreshMinutes: 15, lastSyncedAt: null, syncing: false },
    setRefreshMinutes: hooks.setRefreshMinutes,
    refreshNow: hooks.refreshNow,
  }),
  useCalendarMutations: () => ({ add: vi.fn(), remove: vi.fn(), update: vi.fn() }),
}));

vi.mock('../../../components/common/Select/Select', () => ({
  Select: ({ value, onChange, options, ariaLabel }: {
    value: string; onChange: (v: string) => void; options?: { value: string; label: string }[]; ariaLabel?: string;
  }) => (
    <select aria-label={ariaLabel} value={value} onChange={e => onChange(e.target.value)}>
      {options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  ),
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => (params && Object.keys(params).length > 0 ? `${key}|${Object.values(params).join('|')}` : key),
    language: 'en',
  }),
}));

const source = (id: string): CalendarSourceDto => ({
  id, kind: 'ics', name: `Cal ${id}`, color: '#8b7cff', host: null, lastSyncedAt: null, status: 'ok', error: null,
});

const widget = (config?: Record<string, unknown>, size: PanelWidget['size'] = '4x2'): PanelWidget => ({ id: 'w', type: 'calendar', size, col: 0, row: 0, config } as PanelWidget);

function renderSettings(opts: { surface?: PanelSurface; desktopEditor?: boolean; config?: Record<string, unknown>; size?: PanelWidget['size'] }) {
  const onUpdate = vi.fn();
  render(
    <CalendarSettings
      widget={widget(opts.config, opts.size)}
      surface={opts.surface}
      desktopEditor={opts.desktopEditor}
      onUpdate={onUpdate}
      onResize={vi.fn()}
    />,
  );
  return onUpdate;
}

beforeEach(() => {
  hooks.sources = [source('a'), source('b')];
  hooks.refreshNow.mockClear();
});

describe('CalendarSettings', () => {
  it('offers Add calendar on a pointer surface', () => {
    renderSettings({ surface: 'desktop' });
    expect(screen.getByText('panel.widget.calendar.add.button')).toBeTruthy();
  });

  it.each(['y70', 'phone', 'q60', 'monitor'] as const)('hides Add calendar on the %s panel surface, keeping toggles and refresh', surface => {
    renderSettings({ surface });
    expect(screen.queryByText('panel.widget.calendar.add.button')).toBeNull();
    expect(screen.getAllByRole('switch').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('panel.widget.calendar.settings.refreshNow')).toBeTruthy();
    expect(screen.getByLabelText('panel.widget.calendar.settings.refreshEvery')).toBeTruthy();
  });

  it('keeps Add calendar in the desktop editor even for a touch panel', () => {
    renderSettings({ surface: 'y70', desktopEditor: true });
    expect(screen.getByText('panel.widget.calendar.add.button')).toBeTruthy();
  });

  it('stores hidden calendars as opaque ids only', () => {
    const onUpdate = renderSettings({ surface: 'desktop' });
    const toggle = screen.getByRole('switch', { name: /Cal a/ });
    fireEvent.click(toggle);
    expect(onUpdate).toHaveBeenCalledWith({ hiddenCalendars: ['a'] });
  });

  it('turns a hidden calendar back on', () => {
    const onUpdate = renderSettings({ surface: 'desktop', config: { hiddenCalendars: ['a', 'b'] } });
    fireEvent.click(screen.getByRole('switch', { name: /Cal a/ }));
    expect(onUpdate).toHaveBeenCalledWith({ hiddenCalendars: ['b'] });
  });

  const SMALL = ['2x2', '2x4', '4x2', '2x2round'] as const;
  const sw = (name: string) => screen.getByRole('switch', { name: `panel.widget.calendar.settings.${name}` }) as HTMLButtonElement;

  it.each(SMALL)('greys out the grid toggle at %s while events are on', size => {
    renderSettings({ surface: 'desktop', size, config: { showGrid: false, showEvents: true } });
    expect(sw('showGrid').disabled).toBe(true);
    expect(sw('showEvents').disabled).toBe(false);
  });

  it.each(SMALL)('greys out the events toggle at %s while the grid is on', size => {
    renderSettings({ surface: 'desktop', size, config: { showGrid: true, showEvents: false } });
    expect(sw('showEvents').disabled).toBe(true);
    expect(sw('showGrid').disabled).toBe(false);
  });

  it.each(SMALL)('enables both at %s when both are off', size => {
    renderSettings({ surface: 'desktop', size, config: { showGrid: false, showEvents: false } });
    expect(sw('showGrid').disabled).toBe(false);
    expect(sw('showEvents').disabled).toBe(false);
  });

  it('writes only the toggled key plus the other at its stored value after a resize', () => {
    const onUpdate = renderSettings({ surface: 'desktop', size: '4x2', config: { showGrid: true, showEvents: true } });
    fireEvent.click(sw('showGrid'));
    expect(onUpdate).toHaveBeenCalledWith({ showGrid: false, showEvents: true });
  });

  it('lets both be on at 4x4', () => {
    const onUpdate = renderSettings({ surface: 'desktop', size: '4x4', config: { showGrid: false, showEvents: true } });
    fireEvent.click(screen.getByRole('switch', { name: 'panel.widget.calendar.settings.showGrid' }));
    expect(onUpdate).toHaveBeenCalledWith({ showGrid: true, showEvents: true });
  });

  it('shows both-on stored config as grid on and events off and disabled after a resize, without writing', () => {
    const onUpdate = renderSettings({ surface: 'desktop', size: '4x2', config: { showGrid: true, showEvents: true } });
    expect(sw('showGrid').getAttribute('aria-checked')).toBe('true');
    expect(sw('showGrid').disabled).toBe(false);
    expect(sw('showEvents').getAttribute('aria-checked')).toBe('false');
    expect(sw('showEvents').disabled).toBe(true);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('keeps both on at 4x4 for stored both-on config', () => {
    renderSettings({ surface: 'desktop', size: '4x4', config: { showGrid: true, showEvents: true } });
    expect(sw('showEvents').getAttribute('aria-checked')).toBe('true');
    expect(sw('showEvents').disabled).toBe(false);
    expect(sw('showGrid').disabled).toBe(false);
  });

  it('puts Add calendar last in Calendars, then a separate Sync section with the refresh controls', () => {
    renderSettings({ surface: 'desktop' });
    const order = (el: Element, other: Element) => el.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING;
    const calendars = screen.getByText('panel.widget.calendar.settings.calendars');
    const add = screen.getByText('panel.widget.calendar.add.button');
    const sync = screen.getByText('panel.widget.calendar.settings.sync');
    const every = screen.getByLabelText('panel.widget.calendar.settings.refreshEvery');
    const refresh = screen.getByText('panel.widget.calendar.settings.refreshNow');
    expect(order(calendars, add)).toBeTruthy();
    expect(order(add, sync)).toBeTruthy();
    expect(order(sync, every)).toBeTruthy();
    expect(order(every, refresh)).toBeTruthy();
  });

  it('offers an edit button per calendar on a pointer surface only', () => {
    renderSettings({ surface: 'desktop' });
    expect(screen.getAllByRole('button', { name: /panel.widget.calendar.edit.button/ })).toHaveLength(2);
  });

  it.each(['y70', 'phone', 'q60', 'monitor'] as const)('has no edit button on the %s panel surface', surface => {
    renderSettings({ surface });
    expect(screen.queryByRole('button', { name: /panel.widget.calendar.edit.button/ })).toBeNull();
  });

  it('keeps edit in the desktop editor for a touch panel', () => {
    renderSettings({ surface: 'y70', desktopEditor: true });
    expect(screen.getAllByRole('button', { name: /panel.widget.calendar.edit.button/ })).toHaveLength(2);
  });

  it('refreshes every calendar from one button', () => {
    renderSettings({ surface: 'y70' });
    fireEvent.click(screen.getByText('panel.widget.calendar.settings.refreshNow'));
    expect(hooks.refreshNow).toHaveBeenCalledTimes(1);
  });

  it('changes the service-wide refresh interval', () => {
    renderSettings({ surface: 'desktop' });
    fireEvent.change(screen.getByLabelText('panel.widget.calendar.settings.refreshEvery'), { target: { value: '30' } });
    expect(hooks.setRefreshMinutes).toHaveBeenCalledWith(30);
  });
});
