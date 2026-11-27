import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReminderDto, ReminderListDto } from '../../../api/reminders';
import type { PanelWidget, PanelWidgetSize } from '../../types';
import { PanelPreviewProvider } from '../common/PanelPreviewContext';
import { SMART_COLORS } from './reminderIcons';
import { SMART_LISTS } from './reminderLogic';
import { COMPLETE_DELAY_MS } from './useReminderData';
import { RemindersWidget } from './RemindersWidget';

const store = vi.hoisted(() => ({
  lists: [] as ReminderListDto[],
  items: [] as ReminderDto[],
  loaded: true,
  enabledSeen: [] as boolean[],
  unavailable: false,
  setCompleted: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../../hooks/useReminders', () => ({
  useReminders: (enabled = true) => {
    store.enabledSeen.push(enabled);
    return { lists: store.lists, items: store.items, loaded: store.loaded, unavailable: store.unavailable };
  },
  useReminderMutations: () => ({ setCompleted: store.setCompleted }),
}));

vi.mock('../../../lib/i18n', () => {
  const t = (key: string, params?: Record<string, string | number>) => (params && Object.keys(params).length > 0
    ? `${key}|${Object.values(params).join('|')}`
    : key);
  return { useTranslation: () => ({ t, language: 'en' }) };
});

const NOW = new Date(2026, 10, 17, 14, 35).getTime();
const list = (id: string, name: string, order: number): ReminderListDto => ({ id, name, color: '#0a84ff', icon: 'list', order, createdAt: order });
let n = 0;
function item(listId: string, title: string, extra: Partial<ReminderDto> = {}): ReminderDto {
  n += 1;
  return {
    id: `i${n}`, listId, title, notes: null, dueDate: null, dueTime: null, priority: 0, flagged: false, completed: false,
    completedAt: null, url: null, order: n, createdAt: n, updatedAt: n, ...extra,
  };
}

function widget(size: PanelWidgetSize, config?: Record<string, unknown>): PanelWidget {
  return { id: 'w', type: 'reminders', size, col: 0, row: 0, config } as PanelWidget;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(NOW);
  store.lists = [list('l1', 'Home', 0), list('l2', 'Work', 1)];
  store.items = [
    item('l1', 'Water plants', { dueDate: '2026-11-17' }),
    item('l1', 'Call dentist', { dueDate: '2026-11-15', priority: 2 }),
    item('l2', 'Send update', { dueDate: '2026-11-18', flagged: true }),
    item('l2', 'Undated task'),
    item('l2', 'Finished task', { completed: true, completedAt: 5 }),
  ];
  store.loaded = true;
  store.enabledSeen = [];
  store.unavailable = false;
  store.setCompleted.mockClear();
});

afterEach(() => vi.useRealTimers());

describe('RemindersWidget', () => {
  it('lists Today by default with overdue first and the open count', () => {
    render(<RemindersWidget widget={widget('2x4')} />);
    expect(screen.getByText('reminders.smart.today')).toBeTruthy();
    const rows = screen.getAllByRole('checkbox').map(c => c.getAttribute('aria-label'));
    expect(rows).toEqual(['Call dentist', 'Water plants']);
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('!!')).toBeTruthy();
    expect(screen.queryByText('Send update')).toBeNull();
  });

  it('shows one user list and its completed items only with Show Completed', () => {
    const { rerender } = render(<RemindersWidget widget={widget('2x4', { list: 'l2' })} />);
    expect(screen.getByText('Work')).toBeTruthy();
    expect(screen.queryByText('Finished task')).toBeNull();
    rerender(<RemindersWidget widget={widget('2x4', { list: 'l2', showCompleted: true })} />);
    expect(screen.getByText('Finished task')).toBeTruthy();
  });

  it('renders the six smart-list cards with counts in the category order', () => {
    render(<RemindersWidget widget={widget('4x2', { viewMode: 'grid' })} />);
    const order = ['today', 'scheduled', 'overdue', 'flagged', 'all', 'completed'];
    const names = Array.from(document.querySelectorAll('[class*="name"]')).map(n => n.textContent);
    expect(names).toEqual(order.map(id => `reminders.smart.${id}`));
    expect(screen.getByText('reminders.smart.all').parentElement?.textContent).toContain('4');
    expect(screen.getByText('reminders.smart.overdue').parentElement?.textContent).toContain('1');
  });

  it('colors each card icon from the one category map, with no disc', () => {
    const { container } = render(<RemindersWidget widget={widget('4x2', { viewMode: 'grid' })} />);
    for (const id of SMART_LISTS) {
      const card = screen.getByText(`reminders.smart.${id}`).parentElement!;
      expect(card.querySelector('[class*="icon"]')).toHaveStyle({ color: SMART_COLORS[id] });
    }
    expect(container.innerHTML).not.toMatch(/disc/i);
  });

  it('shows only icon and count at 2x2, keeping the names for assistive tech', () => {
    render(<RemindersWidget widget={widget('2x2', { viewMode: 'grid' })} />);
    const label = screen.getByText('reminders.smart.today');
    expect(label.className).toContain('srOnly');
    expect(document.querySelectorAll('[class*="name"]')).toHaveLength(0);
  });

  it('puts the count on the icon line, right beside the icon, with the name below, in every stacked card', () => {
    for (const size of ['2x2', '4x2', '4x4'] as const) {
      const { container, unmount } = render(<RemindersWidget widget={widget(size, { viewMode: 'grid' })} />);
      const card = screen.getByText('reminders.smart.all').closest('[class*="stack"]')!;
      const top = card.querySelector('[class*="top"]')!;
      expect(top.children).toHaveLength(2);
      expect(top.children[0].querySelector('svg')).not.toBeNull();
      expect(top.children[1].textContent).toBe('4');
      expect(top.contains(screen.getByText('reminders.smart.all'))).toBe(false);
      expect(container.querySelectorAll('[class*="stack"]')).toHaveLength(6);
      unmount();
    }
  });

  it('keeps the tall strip as one row per card: icon, name, count', () => {
    const { container } = render(<RemindersWidget widget={widget('2x4', { viewMode: 'grid' })} />);
    expect(container.querySelectorAll('[class*="stack"]')).toHaveLength(0);
    expect(container.querySelector('[class*="top"]')).toBeNull();
  });

  it('stretches the grid over the tile on 1fr tracks', () => {
    const { container } = render(<RemindersWidget widget={widget('2x2', { viewMode: 'grid' })} />);
    const grid = container.querySelector<HTMLElement>('[class*="cards"]')!;
    expect(grid.className).toContain('fill');
    expect(grid.style.gridTemplateRows).toBe('repeat(3, minmax(0, 1fr))');
    expect(grid.style.fontSize).toBe('');
  });

  it('fills the 4x2 as three columns by two rows and the 2x4 as six rows', () => {
    const wide = render(<RemindersWidget widget={widget('4x2', { viewMode: 'grid' })} />);
    const wideGrid = wide.container.querySelector<HTMLElement>('[class*="cards"]')!;
    expect(wideGrid.style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))');
    expect(wideGrid.style.gridTemplateRows).toBe('repeat(2, minmax(0, 1fr))');
    wide.unmount();
    const tall = render(<RemindersWidget widget={widget('2x4', { viewMode: 'grid' })} />);
    expect(tall.container.querySelector<HTMLElement>('[class*="cards"]')!.style.gridTemplateRows).toBe('repeat(6, minmax(0, 1fr))');
  });

  it('makes the 4x4 top the same block as the 4x2 and fills the bottom with My Lists rows', () => {
    const four = render(<RemindersWidget widget={widget('4x4', { viewMode: 'grid' })} />);
    const topGrid = four.container.querySelector<HTMLElement>('[class*="cards"]')!;
    expect(topGrid.style.gridTemplateRows).toBe('repeat(2, minmax(0, 1fr))');
    expect(topGrid.style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))');
    const lists = four.container.querySelector<HTMLElement>('[class*="lists"]')!;
    expect(lists.style.gridTemplateRows).toBe('repeat(2, minmax(0, 1fr))');
    expect(lists.textContent).toContain('Home');
    four.unmount();
    const two = render(<RemindersWidget widget={widget('4x2', { viewMode: 'grid' })} />);
    const twoGrid = two.container.querySelector<HTMLElement>('[class*="cards"]')!;
    expect(twoGrid.style.gridTemplateColumns).toBe(topGrid.style.gridTemplateColumns);
    expect(twoGrid.style.gridTemplateRows).toBe(topGrid.style.gridTemplateRows);
  });

  it('lays the grid out per size: two columns at 2x2, one at 2x4, three at 4x2 and 4x4', () => {
    const columns = (size: PanelWidgetSize) => {
      const { container, unmount } = render(<RemindersWidget widget={widget(size, { viewMode: 'grid' })} />);
      const grid = container.querySelector<HTMLElement>('[class*="cards"]')!;
      const value = grid.style.gridTemplateColumns;
      unmount();
      return value;
    };
    expect(columns('2x2')).toBe('repeat(2, minmax(0, 1fr))');
    expect(columns('2x4')).toBe('repeat(1, minmax(0, 1fr))');
    expect(columns('4x2')).toBe('repeat(3, minmax(0, 1fr))');
    expect(columns('4x4')).toBe('repeat(3, minmax(0, 1fr))');
  });

  it('colors a smart list header from the map and lists Overdue', () => {
    render(<RemindersWidget widget={widget('2x4', { list: 'smart:overdue' })} />);
    expect(screen.getByText('reminders.smart.overdue')).toHaveStyle({ color: SMART_COLORS.overdue });
    expect(screen.getAllByRole('checkbox').map(c => c.getAttribute('aria-label'))).toEqual(['Call dentist']);
  });

  it('adds My Lists under the grid at 4x4 only', () => {
    const { rerender } = render(<RemindersWidget widget={widget('4x2', { viewMode: 'grid' })} />);
    expect(screen.queryByText('Home')).toBeNull();
    rerender(<RemindersWidget widget={widget('4x4', { viewMode: 'grid' })} />);
    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText('Work')).toBeTruthy();
  });

  it('caps rows by size and says how many are cut', () => {
    store.items = Array.from({ length: 6 }, (_, i) => item('l1', `Task ${i}`, { dueDate: '2026-11-17' }));
    render(<RemindersWidget widget={widget('2x2')} />);
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    expect(screen.getByText('reminders.widget.more|3')).toBeTruthy();
  });

  it('shows the done state, then completes after the animation delay', () => {
    render(<RemindersWidget widget={widget('2x4')} />);
    const check = screen.getByRole('checkbox', { name: 'Water plants' });
    fireEvent.click(check);
    expect(check.getAttribute('aria-checked')).toBe('true');
    expect(store.setCompleted).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(COMPLETE_DELAY_MS + 1); });
    expect(store.setCompleted).toHaveBeenCalledWith(store.items[0].id, true);
  });

  it('cancels a check tapped again before the delay ends', () => {
    render(<RemindersWidget widget={widget('2x4')} />);
    const check = screen.getByRole('checkbox', { name: 'Water plants' });
    fireEvent.click(check);
    fireEvent.click(check);
    act(() => { vi.advanceTimersByTime(COMPLETE_DELAY_MS * 2); });
    expect(store.setCompleted).not.toHaveBeenCalled();
    expect(check.getAttribute('aria-checked')).toBe('false');
  });

  it('still completes a checked item when the tile unmounts before the delay ends', () => {
    const { unmount } = render(<RemindersWidget widget={widget('2x4')} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Water plants' }));
    unmount();
    expect(store.setCompleted).toHaveBeenCalledWith(store.items[0].id, true);
    act(() => { vi.advanceTimersByTime(COMPLETE_DELAY_MS * 2); });
    expect(store.setCompleted).toHaveBeenCalledTimes(1);
  });

  it('leaves rows that have no service id yet inert', () => {
    store.items = [item('l1', 'Just added', { id: 'pending-item-1', dueDate: '2026-11-17' })];
    render(<RemindersWidget widget={widget('2x4')} />);
    expect((screen.getByRole('checkbox', { name: 'Just added' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows a loading state, not an empty one, until the first fetch settles', () => {
    store.loaded = false;
    store.items = [];
    render(<RemindersWidget widget={widget('2x4')} />);
    expect(screen.getByRole('img', { name: 'common.loading' })).toBeTruthy();
    expect(screen.queryByText('reminders.widget.allDone')).toBeNull();
  });

  it('does not let a check tap reach the tile', () => {
    const onTile = vi.fn();
    render(<div onClick={onTile}><RemindersWidget widget={widget('2x4')} /></div>);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Water plants' }));
    expect(onTile).not.toHaveBeenCalled();
  });

  it('is display only on a surface without touch', () => {
    render(<RemindersWidget widget={widget('2x4')} surface="q60" />);
    expect((screen.getByRole('checkbox', { name: 'Water plants' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('says so when every item is done and when there are no lists', () => {
    store.items = [];
    const { rerender } = render(<RemindersWidget widget={widget('2x4')} />);
    expect(screen.getByText('reminders.widget.allDone')).toBeTruthy();
    store.lists = [];
    rerender(<RemindersWidget widget={widget('2x4')} />);
    expect(screen.getByText('reminders.empty.noLists')).toBeTruthy();
  });

  it('shows an error state, not an empty list, while the service is unavailable', () => {
    store.unavailable = true;
    store.items = [];
    render(<RemindersWidget widget={widget('2x4')} />);
    expect(screen.getByRole('alert').textContent).toBe('reminders.error.unavailable');
    expect(screen.queryByText('reminders.widget.allDone')).toBeNull();
  });

  it('renders the fixture and skips every fetch in preview mode', () => {
    render(<PanelPreviewProvider value><RemindersWidget widget={widget('4x4')} /></PanelPreviewProvider>);
    expect(screen.getByText('Call the dentist')).toBeTruthy();
    expect(store.enabledSeen.every(enabled => enabled === false)).toBe(true);
    expect((screen.getByRole('checkbox', { name: 'Call the dentist' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
