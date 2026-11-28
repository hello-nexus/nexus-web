import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarRequestError, type CalendarProbe, type CalendarSourceDto } from '../../../../api/calendar';
import { normalizeEvent, type CalEvent } from '../calendarEvents';
import { timedEvent } from '../calendarPreviewData';
import { CalendarPage } from './CalendarPage';
import { popoverMaxHeight } from '../CalendarEventPopover';

const store = vi.hoisted(() => ({
  sources: [] as CalendarSourceDto[],
  events: [] as CalEvent[],
  hiddenSeen: [] as string[][],
  truncated: false,
  add: vi.fn(),
  remove: vi.fn(),
  update: vi.fn(),
  refreshNow: vi.fn(() => Promise.resolve()),
  setRefreshMinutes: vi.fn(() => Promise.resolve()),
}));

const probe = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock('../../../../api/calendar', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../api/calendar')>()),
  probeCalendar: (url: string) => probe.fn(url),
}));

vi.mock('../../../../hooks/useCalendar', () => ({
  useCalendarSources: () => ({ sources: store.sources, loaded: true }),
  useCalendarEvents: (_f: number, _t: number, hidden: readonly string[] = []) => {
    store.hiddenSeen.push([...hidden]);
    return { events: store.events.filter(e => !hidden.includes(e.calendarId)), syncedAt: null, loaded: true, truncated: store.truncated };
  },
  useCalendarSettings: () => ({
    settings: { refreshMinutes: 15, lastSyncedAt: null, syncing: false },
    setRefreshMinutes: store.setRefreshMinutes,
    refreshNow: store.refreshNow,
  }),
  useCalendarMutations: () => ({ add: store.add, remove: store.remove, update: store.update }),
}));

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => (params && Object.keys(params).length > 0 ? `${key}|${Object.values(params).join('|')}` : key),
    language: 'en',
  }),
}));

vi.mock('../../../../components/common/Select/Select', () => ({
  Select: ({ value, onChange, options, ariaLabel }: {
    value: string; onChange: (v: string) => void; options?: { value: string; label: string }[]; ariaLabel?: string;
  }) => (
    <select aria-label={ariaLabel} value={value} onChange={e => onChange(e.target.value)}>
      {options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  ),
}));

const NOW = new Date(2026, 10, 17, 14, 35).getTime();
const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m).getTime();
const source = (id: string, name: string, color: string): CalendarSourceDto => ({
  id, kind: 'ics', name, color, host: null, lastSyncedAt: null, status: 'ok', error: null,
});

function ev(id: string, cal: string, title: string, day: number, sh: number, eh: number, extra: Partial<CalEvent> = {}): CalEvent {
  return { ...normalizeEvent(timedEvent(id, cal, title, at(day, sh), at(day, eh))), ...extra };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'setTimeout', 'Date'], shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  window.localStorage.clear();
  store.sources = [source('work', 'Work', '#8b7cff'), source('home', 'Home', '#ff9f0a')];
  store.events = [
    ev('1', 'work', 'Design review', 17, 14, 15, { location: 'Studio', notes: 'Bring the mockups' }),
    ev('2', 'home', 'Pick up Leo', 17, 16, 17),
  ];
  store.hiddenSeen = [];
  store.truncated = false;
  store.add.mockReset();
  store.remove.mockReset();
  store.update.mockReset();
  probe.fn.mockReset();
  probe.fn.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

function Host({ start }: { start: string }) {
  const [tab, setTab] = useState<string | null>(start);
  return <CalendarPage tab={tab} onTabChange={setTab} />;
}

describe('CalendarPage date selection', () => {
  const activeTab = (c: HTMLElement) => c.querySelector('[role="tab"][aria-selected="true"]')?.textContent;
  const railDay = (c: HTMLElement, label: string) => within(c.querySelector('aside') as HTMLElement).getByRole('button', { name: label });

  it('opens the day clicked in the rail mini-month and stays on it', () => {
    const { container } = render(<Host start="month" />);
    fireEvent.click(railDay(container, '30'));
    expect(activeTab(container)).toBe('panel.widget.calendar.view.day');
    expect(screen.getByText('Monday, November 30')).toBeTruthy();
  });

  it('opens the day whose number is clicked in the month grid', () => {
    const { container } = render(<Host start="month" />);
    fireEvent.click(screen.getByRole('button', { name: 'Monday, November 30' }));
    expect(activeTab(container)).toBe('panel.widget.calendar.view.day');
    expect(screen.getByText('Monday, November 30')).toBeTruthy();
  });

  it('steps and returns to today from a day picked in the month grid', () => {
    render(<Host start="month" />);
    fireEvent.click(screen.getByRole('button', { name: 'Monday, November 30' }));
    fireEvent.click(screen.getByRole('button', { name: 'panel.widget.calendar.next' }));
    expect(screen.getByText('Tuesday, December 1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'panel.widget.calendar.prev' }));
    fireEvent.click(screen.getByRole('button', { name: 'panel.widget.calendar.prev' }));
    expect(screen.getByText('Sunday, November 29')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'panel.widget.calendar.today' }));
    expect(screen.getByText('Tuesday, November 17')).toBeTruthy();
  });
});

describe('CalendarPage', () => {
  it('opens a read-only popover from an event and closes it on Escape', () => {
    render(<CalendarPage tab="day" />);
    fireEvent.click(screen.getByRole('button', { name: 'Design review' }));
    const dialog = screen.getByRole('dialog', { name: 'Design review' });
    expect(within(dialog).getByText('Studio')).toBeTruthy();
    expect(within(dialog).getByText('Bring the mockups')).toBeTruthy();
    expect(within(dialog).getByText('Work')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Design review' })).toBeNull();
  });

  it('marks the event whose popover is open and clears it on close', () => {
    render(<CalendarPage tab="day" />);
    const chip = screen.getByRole('button', { name: 'Design review' });
    expect(chip.getAttribute('data-selected')).toBeNull();
    fireEvent.click(chip);
    expect(screen.getByRole('button', { name: 'Design review' }).getAttribute('data-selected')).toBe('true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Design review' }).getAttribute('data-selected')).toBeNull();
  });

  it('links http(s) URLs in the notes as external anchors and leaves other text plain', () => {
    store.events = [ev('1', 'work', 'Call', 17, 14, 15, { notes: 'Join https://meet.example.com/a?x=1&y=2. Not javascript:alert(1)' })];
    render(<CalendarPage tab="day" />);
    fireEvent.click(screen.getByRole('button', { name: 'Call' }));
    const link = screen.getByRole('link', { name: 'meet.example.com/a?x=1&y=2' }) as HTMLAnchorElement;
    expect(link.href).toBe('https://meet.example.com/a?x=1&y=2');
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener noreferrer');
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('shortens long URLs to one line while keeping the full href', () => {
    const long = `https://nam06.safelinks.protection.outlook.com/?url=${'a'.repeat(400)}&data=05`;
    store.events = [ev('1', 'work', 'Teams', 17, 14, 15, { notes: `Join ${long}\n\n\n\n\nAfter` })];
    render(<CalendarPage tab="day" />);
    fireEvent.click(screen.getByRole('button', { name: 'Teams' }));
    const link = screen.getByRole('link') as HTMLAnchorElement;
    expect(link.href).toBe(long);
    expect(link.textContent!.length).toBe(56);
    expect(link.textContent!.endsWith('\u2026')).toBe(true);
  });

  it('caps the popover height to the bounds, leaving margins', () => {
    expect(popoverMaxHeight(600, 900)).toBe(584);
    expect(popoverMaxHeight(null, 750)).toBe(734);
    expect(popoverMaxHeight(40, 900)).toBe(120);
  });

  it('says so when the service cut the event list', () => {
    store.truncated = true;
    render(<CalendarPage tab="day" />);
    expect(screen.getByText('panel.widget.calendar.events.truncated')).toBeTruthy();
  });

  it('toggles the popover when the same event is pressed twice', () => {
    render(<CalendarPage tab="day" />);
    const chip = screen.getByRole('button', { name: 'Design review' });
    fireEvent.click(chip);
    fireEvent.click(chip);
    expect(screen.queryByRole('dialog', { name: 'Design review' })).toBeNull();
  });

  it('folds a crowded month cell into "+N more" and lists the whole day from it', () => {
    store.events = [
      ev('1', 'work', 'One', 17, 8, 9), ev('2', 'work', 'Two', 17, 9, 10), ev('3', 'home', 'Three', 17, 10, 11),
      ev('4', 'home', 'Four', 17, 11, 12), ev('5', 'work', 'Five', 17, 12, 13), ev('6', 'work', 'Six', 17, 13, 14),
      ev('7', 'work', 'Seven', 17, 14, 15), ev('8', 'work', 'Eight', 17, 15, 16), ev('9', 'work', 'Nine', 17, 16, 17),
    ];
    render(<CalendarPage tab="month" />);
    const more = screen.getAllByRole('button').find(b => b.getAttribute('aria-label')?.startsWith('panel.widget.calendar.moreCount'));
    expect(more).toBeTruthy();
    fireEvent.click(more!);
    const dialog = screen.getAllByRole('dialog')[0];
    expect(within(dialog).getAllByRole('button').length).toBe(9);
  });

  it('marks only today in the month grid', () => {
    const { container } = render(<CalendarPage tab="month" />);
    const marked = container.querySelectorAll('[data-today="true"]');
    expect(marked.length).toBe(1);
    expect(marked[0].textContent).toBe('17');
    const cell = marked[0] as HTMLElement;
    const fills = Array.from(container.querySelectorAll<HTMLElement>('[aria-hidden="true"]')).filter(el => el.style.gridColumn !== '');
    expect(fills.length).toBe(1);
    expect(fills[0].parentElement).toBe(cell.parentElement);
    expect(fills[0].style.gridColumn).toBe(cell.style.gridColumn);
  });

  it('hides a calendar from the view only, and remembers the choice', () => {
    render(<CalendarPage tab="day" />);
    expect(screen.getByRole('button', { name: 'Pick up Leo' })).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Home' }));
    expect(screen.queryByRole('button', { name: 'Pick up Leo' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Design review' })).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem('nexus.calendar.hiddenCalendars') ?? '[]')).toEqual(['home']);
  });

  it('starts with the saved hidden calendars', () => {
    window.localStorage.setItem('nexus.calendar.hiddenCalendars', JSON.stringify(['work']));
    render(<CalendarPage tab="day" />);
    expect(screen.queryByRole('button', { name: 'Design review' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Pick up Leo' })).toBeTruthy();
  });

  it('switches views through the docked tabs', () => {
    const onTabChange = vi.fn();
    render(<CalendarPage tab="month" onTabChange={onTabChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'panel.widget.calendar.view.list' }));
    expect(onTabChange).toHaveBeenCalledWith('list');
  });

  it('defaults to the month view and treats an unknown tab the same', () => {
    render(<CalendarPage tab="nonsense" />);
    expect(screen.getByText('November')).toBeTruthy();
  });

  it('orders the rail as Calendars, Add calendar, then Sync with the refresh controls', () => {
    render(<CalendarPage tab="day" />);
    const follows = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    const titles = ['calendars', 'sync'].map(k => screen.getByText(`panel.widget.calendar.settings.${k}`));
    const add = screen.getByText('panel.widget.calendar.add.button');
    const refresh = screen.getByText('panel.widget.calendar.settings.refreshNow');
    expect(follows(titles[0], add)).toBe(true);
    expect(follows(add, titles[1])).toBe(true);
    expect(follows(titles[1], refresh)).toBe(true);
    expect(screen.getAllByText('panel.widget.calendar.add.button')).toHaveLength(1);
  });

  it('refreshes from the rail', () => {
    render(<CalendarPage tab="day" />);
    fireEvent.click(screen.getByText('panel.widget.calendar.settings.refreshNow'));
    expect(store.refreshNow).toHaveBeenCalledTimes(1);
  });

});

describe('Edit calendar dialog', () => {
  const openEdit = () => {
    render(<CalendarPage tab="day" />);
    fireEvent.click(screen.getByRole('button', { name: 'panel.widget.calendar.edit.button|Home' }));
    return screen.getByRole('alertdialog');
  };

  it('shows the feed host read-only and keeps Save disabled until something changes', () => {
    store.sources = [{ ...source('home', 'Home', '#ff9f0a'), host: 'calendar.example.org' }, source('work', 'Work', '#8b7cff')];
    const dialog = openEdit();
    expect(within(dialog).getByText('calendar.example.org')).toBeTruthy();
    const save = within(dialog).getByText('panel.widget.calendar.edit.save').closest('button') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.input(within(dialog).getByLabelText('panel.widget.calendar.add.name'), { target: { value: 'Household' } });
    expect(save.disabled).toBe(false);
  });

  it('saves the new name and color then closes, with Cancel first in the footer', async () => {
    store.update.mockResolvedValue({});
    const dialog = openEdit();
    const labels = within(dialog).getAllByRole('button').map(b => b.textContent);
    expect(labels.indexOf('confirm.cancel')).toBeLessThan(labels.indexOf('panel.widget.calendar.edit.save'));
    fireEvent.input(within(dialog).getByLabelText('panel.widget.calendar.add.name'), { target: { value: ' Household ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '#0a84ff' }));
    fireEvent.click(within(dialog).getByText('panel.widget.calendar.edit.save'));
    await waitFor(() => expect(store.update).toHaveBeenCalledWith('home', { name: 'Household', color: '#0a84ff' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('opens a custom color selected in the last swatch', () => {
    store.sources = [source('home', 'Home', '#12ab34'), source('work', 'Work', '#8b7cff')];
    const dialog = openEdit();
    const custom = within(dialog).getByRole('button', { name: 'common.customColor' });
    expect(custom.getAttribute('aria-current')).toBe('true');
    expect(custom.style.background).not.toBe('');
  });

  it('sends an empty name when the name is cleared and saved', async () => {
    store.update.mockResolvedValue({});
    const dialog = openEdit();
    fireEvent.input(within(dialog).getByLabelText('panel.widget.calendar.add.name'), { target: { value: '' } });
    fireEvent.click(within(dialog).getByText('panel.widget.calendar.edit.save'));
    await waitFor(() => expect(store.update).toHaveBeenCalledWith('home', { name: '', color: '#ff9f0a' }));
  });

  it('closes without saving on Cancel', () => {
    const dialog = openEdit();
    fireEvent.input(within(dialog).getByLabelText('panel.widget.calendar.add.name'), { target: { value: 'X' } });
    fireEvent.click(within(dialog).getByText('confirm.cancel'));
    expect(store.update).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('shows an inline error and stays open when saving fails', async () => {
    store.update.mockRejectedValue(new Error('boom'));
    const dialog = openEdit();
    fireEvent.input(within(dialog).getByLabelText('panel.widget.calendar.add.name'), { target: { value: 'X' } });
    fireEvent.click(within(dialog).getByText('panel.widget.calendar.edit.save'));
    expect((await screen.findByRole('alert')).textContent).toBe('panel.widget.calendar.edit.error');
  });

  it('asks before removing, and Cancel keeps the calendar', async () => {
    store.remove.mockResolvedValue(undefined);
    const dialog = openEdit();
    fireEvent.click(within(dialog).getByText('panel.widget.calendar.remove.title'));
    expect(store.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('confirm.cancel'));
    expect(store.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'panel.widget.calendar.edit.button|Home' }));
    fireEvent.click(screen.getByText('panel.widget.calendar.remove.title'));
    fireEvent.click(screen.getByText('panel.widget.calendar.remove.confirm'));
    await waitFor(() => expect(store.remove).toHaveBeenCalledWith('home'));
  });
});

describe('Add calendar name autofill', () => {
  const open = () => {
    render(<CalendarPage tab="day" />);
    fireEvent.click(screen.getByText('panel.widget.calendar.add.button'));
    return screen.getByRole('alertdialog');
  };
  const typeUrl = (dialog: HTMLElement, value: string) =>
    fireEvent.input(within(dialog).getByLabelText('panel.widget.calendar.add.address'), { target: { value } });
  const nameField = (dialog: HTMLElement) => within(dialog).getByLabelText('panel.widget.calendar.add.name') as HTMLInputElement;
  const settle = async () => { await act(async () => { vi.advanceTimersByTime(600); await Promise.resolve(); await Promise.resolve(); }); };

  it('fills a blank name from the probe after the debounce, once', async () => {
    probe.fn.mockResolvedValue({ name: 'Team Calendar', host: 'x.test' } satisfies CalendarProbe);
    const dialog = open();
    typeUrl(dialog, 'https://x.test/a.ics');
    expect(probe.fn).not.toHaveBeenCalled();
    await settle();
    expect(probe.fn).toHaveBeenCalledTimes(1);
    expect(probe.fn).toHaveBeenCalledWith('https://x.test/a.ics');
    expect(nameField(dialog).value).toBe('Team Calendar');
  });

  it('leaves the name empty when the feed has none', async () => {
    probe.fn.mockResolvedValue({ name: null, host: 'x.test' });
    const dialog = open();
    typeUrl(dialog, 'https://x.test/a.ics');
    await settle();
    expect(nameField(dialog).value).toBe('');
  });

  it('never overwrites a name the user typed', async () => {
    probe.fn.mockResolvedValue({ name: 'Feed Name', host: 'x.test' });
    const dialog = open();
    fireEvent.input(within(dialog).getByLabelText('panel.widget.calendar.add.name'), { target: { value: 'Mine' } });
    typeUrl(dialog, 'https://x.test/a.ics');
    await settle();
    expect(nameField(dialog).value).toBe('Mine');
  });

  it('ignores a stale response when the address changed again', async () => {
    let first!: (v: CalendarProbe) => void;
    probe.fn.mockImplementationOnce(() => new Promise<CalendarProbe>(resolve => { first = resolve; }));
    probe.fn.mockResolvedValueOnce({ name: 'Second', host: 'y.test' });
    const dialog = open();
    typeUrl(dialog, 'https://x.test/a.ics');
    await settle();
    typeUrl(dialog, 'https://y.test/b.ics');
    await settle();
    expect(nameField(dialog).value).toBe('Second');
    await act(async () => { first({ name: 'First', host: 'x.test' }); await Promise.resolve(); });
    expect(nameField(dialog).value).toBe('Second');
  });

  it('shows a refused address early with the mapped message', async () => {
    probe.fn.mockRejectedValue(new CalendarRequestError('bad', 'invalidUrl'));
    const dialog = open();
    typeUrl(dialog, 'https://192.168.1.5/a.ics');
    await settle();
    expect(within(dialog).getByRole('alert').textContent).toBe('panel.widget.calendar.add.error.invalidUrl');
  });

  it('stays silent when the service has no probe route', async () => {
    probe.fn.mockResolvedValue(null);
    const dialog = open();
    typeUrl(dialog, 'https://x.test/a.ics');
    await settle();
    expect(within(dialog).queryByRole('alert')).toBeNull();
    expect(nameField(dialog).value).toBe('');
  });

  it('does not probe text that is not a URL, and probes on blur without waiting', async () => {
    probe.fn.mockResolvedValue({ name: 'N', host: 'x.test' });
    const dialog = open();
    typeUrl(dialog, 'not a url');
    await settle();
    expect(probe.fn).not.toHaveBeenCalled();
    typeUrl(dialog, 'https://x.test/a.ics');
    fireEvent.blur(within(dialog).getByLabelText('panel.widget.calendar.add.address'));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(probe.fn).toHaveBeenCalledTimes(1);
  });
});

describe('Add calendar dialog', () => {
  const open = () => {
    render(<CalendarPage tab="day" />);
    fireEvent.click(screen.getByText('panel.widget.calendar.add.button'));
    return screen.getByRole('alertdialog');
  };

  it('keeps Add disabled until an address is typed and puts Cancel first', () => {
    const dialog = open();
    const buttons = within(dialog).getAllByRole('button');
    const labels = buttons.map(b => b.textContent);
    expect(labels.indexOf('confirm.cancel')).toBeLessThan(labels.indexOf('panel.widget.calendar.add.confirm'));
    const add = within(dialog).getByText('panel.widget.calendar.add.confirm').closest('button') as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.input(within(dialog).getByLabelText('panel.widget.calendar.add.address'), { target: { value: 'https://x.test/a.ics' } });
    expect(add.disabled).toBe(false);
  });

  it('saves a custom color picked from the last swatch', async () => {
    store.add.mockResolvedValue({});
    const dialog = open();
    fireEvent.input(within(dialog).getByLabelText('panel.widget.calendar.add.address'), { target: { value: 'https://x.test/a.ics' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'common.customColor' }));
    fireEvent.change(await screen.findByLabelText('common.hexColor'), { target: { value: '#12AB34' } });
    fireEvent.click(within(dialog).getByText('panel.widget.calendar.add.confirm'));
    await waitFor(() => expect(store.add).toHaveBeenCalled());
    expect(store.add.mock.calls[0][0].color).toBe('#12ab34');
  });

  it('sends the address, a name and a color, then closes', async () => {
    store.add.mockResolvedValue({});
    const dialog = open();
    fireEvent.input(within(dialog).getByLabelText('panel.widget.calendar.add.address'), { target: { value: ' https://x.test/a.ics ' } });
    fireEvent.input(within(dialog).getByLabelText('panel.widget.calendar.add.name'), { target: { value: 'Gym' } });
    fireEvent.click(within(dialog).getByText('panel.widget.calendar.add.confirm'));
    await waitFor(() => expect(store.add).toHaveBeenCalledTimes(1));
    expect(store.add.mock.calls[0][0]).toMatchObject({ url: 'https://x.test/a.ics', name: 'Gym' });
    expect(store.add.mock.calls[0][0].color).toMatch(/^#[0-9a-f]{6}$/);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('sends an empty name when the field is blank, leaving the default to the service', async () => {
    store.add.mockResolvedValue({});
    const dialog = open();
    fireEvent.input(within(dialog).getByLabelText('panel.widget.calendar.add.address'), { target: { value: 'webcal://cal.example.org/feed.ics' } });
    fireEvent.click(within(dialog).getByText('panel.widget.calendar.add.confirm'));
    await waitFor(() => expect(store.add).toHaveBeenCalled());
    expect(store.add.mock.calls[0][0].name).toBe('');
  });

  it('shows the service refusal inline and stays open', async () => {
    store.add.mockRejectedValue(new CalendarRequestError('bad', 'notIcs'));
    const dialog = open();
    fireEvent.input(within(dialog).getByLabelText('panel.widget.calendar.add.address'), { target: { value: 'https://x.test/page' } });
    fireEvent.click(within(dialog).getByText('panel.widget.calendar.add.confirm'));
    expect((await screen.findByRole('alert')).textContent).toBe('panel.widget.calendar.add.error.notIcs');
    expect(screen.getByRole('alertdialog')).toBeTruthy();
  });

  it('warns inline that the calendar is already added and does not close', async () => {
    store.add.mockRejectedValue(new CalendarRequestError('bad', 'duplicate'));
    const dialog = open();
    fireEvent.input(within(dialog).getByLabelText('panel.widget.calendar.add.address'), { target: { value: 'https://x.test/a.ics' } });
    fireEvent.click(within(dialog).getByText('panel.widget.calendar.add.confirm'));
    expect((await screen.findByRole('alert')).textContent).toBe('panel.widget.calendar.add.error.duplicate');
    expect(screen.getByRole('alertdialog')).toBeTruthy();
  });

  it.each(['notFound', 'unauthorized'] as const)('points a refused Google public address to the secret iCal address (%s)', async code => {
    store.add.mockRejectedValue(new CalendarRequestError('bad', code));
    const dialog = open();
    fireEvent.input(within(dialog).getByLabelText('panel.widget.calendar.add.address'), { target: { value: 'https://calendar.google.com/calendar/ical/me%40x.com/public/basic.ics' } });
    fireEvent.click(within(dialog).getByText('panel.widget.calendar.add.confirm'));
    expect((await screen.findByRole('alert')).textContent).toBe('panel.widget.calendar.add.error.googlePublic');
  });

  it('falls back to a generic message for an unknown failure', async () => {
    store.add.mockRejectedValue(new Error('boom'));
    const dialog = open();
    fireEvent.input(within(dialog).getByLabelText('panel.widget.calendar.add.address'), { target: { value: 'https://x.test/page' } });
    fireEvent.click(within(dialog).getByText('panel.widget.calendar.add.confirm'));
    expect((await screen.findByRole('alert')).textContent).toBe('panel.widget.calendar.add.error.generic');
  });

  it('offers one external link to the guide and no step text', () => {
    const dialog = open();
    const links = within(dialog).getAllByRole('link');
    expect(links).toHaveLength(1);
    const link = links[0] as HTMLAnchorElement;
    expect(link.textContent).toBe('panel.widget.calendar.add.addressHelp');
    expect(link.href).toBe('https://hellonexus.com/docs/guides/remote-devices/add-a-calendar');
    expect(link.target).toBe('_blank');
    expect(within(dialog).queryByText(/add\.help\./)).toBeNull();
  });

  it('says the calendar is read-only and offers no sign-in row', () => {
    const dialog = open();
    expect(within(dialog).getByText('panel.widget.calendar.add.readOnly')).toBeTruthy();
    expect(within(dialog).queryByText(/signIn|comingLater/)).toBeNull();
  });
});
