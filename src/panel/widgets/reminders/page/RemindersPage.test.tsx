import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReminderDto, ReminderListDto } from '../../../../api/reminders';
import { SMART_COLORS } from '../reminderIcons';
import { SMART_LISTS } from '../reminderLogic';
import { COMPLETE_DELAY_MS } from '../useReminderData';
import { detailsPatch, isWebUrl } from './ReminderDetailsModal';
import { RemindersPage } from './RemindersPage';

const store = vi.hoisted(() => ({
  lists: [] as ReminderListDto[],
  items: [] as ReminderDto[],
  create: vi.fn(() => Promise.resolve({ id: 'new' })),
  update: vi.fn(() => Promise.resolve()),
  setCompleted: vi.fn(() => Promise.resolve()),
  remove: vi.fn(() => Promise.resolve()),
  clearCompleted: vi.fn(() => Promise.resolve()),
  reorder: vi.fn(() => Promise.resolve()),
  createList: vi.fn((input: { name: string }) => Promise.resolve({ id: 'made', ...input })),
  updateList: vi.fn(() => Promise.resolve()),
  deleteList: vi.fn(() => Promise.resolve()),
  unavailable: false,
  loaded: true,
}));

vi.mock('../../../../hooks/useReminders', () => ({
  useReminders: () => ({ lists: store.lists, items: store.items, loaded: store.loaded, unavailable: store.unavailable }),
  useReminderMutations: () => ({
    create: store.create, update: store.update, setCompleted: store.setCompleted, remove: store.remove,
    clearCompleted: store.clearCompleted, reorder: store.reorder, createList: store.createList, updateList: store.updateList,
    deleteList: store.deleteList,
  }),
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
const list = (id: string, name: string, order: number): ReminderListDto => ({ id, name, color: '#0a84ff', icon: 'list', order, createdAt: order });
let n = 0;
function item(listId: string, title: string, extra: Partial<ReminderDto> = {}): ReminderDto {
  n += 1;
  return {
    id: `i${n}`, listId, title, notes: null, dueDate: null, dueTime: null, priority: 0, flagged: false, completed: false,
    completedAt: null, url: null, order: n, createdAt: n, updatedAt: n, ...extra,
  };
}

const typeInto = (el: HTMLElement, value: string) => {
  fireEvent.input(el, { target: { value } });
  fireEvent.keyDown(el, { key: 'Enter' });
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'], shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  window.localStorage.clear();
  store.unavailable = false;
  store.loaded = true;
  store.lists = [list('l1', 'Home', 0), list('l2', 'Work', 1)];
  store.items = [
    item('l1', 'Water plants', { dueDate: '2026-11-17', notes: 'Fern first' }),
    item('l1', 'Call dentist', { dueDate: '2026-11-15', priority: 2 }),
    item('l2', 'Send update', { dueDate: '2026-11-19', flagged: true }),
    item('l1', 'Finished chore', { completed: true, completedAt: 5 }),
  ];
  Object.values(store).forEach(v => { if (typeof v === 'function' && 'mockClear' in v) (v as { mockClear: () => void }).mockClear(); });
});

afterEach(() => vi.useRealTimers());

describe('RemindersPage', () => {
  it('opens on Today with overdue grouped on top', () => {
    render(<RemindersPage />);
    expect(screen.getByText('reminders.group.overdue')).toBeTruthy();
    const checks = screen.getAllByRole('checkbox').map(c => c.getAttribute('aria-label'));
    expect(checks.slice(0, 2)).toEqual(['Call dentist', 'Water plants']);
  });

  it('has no page tabs: the six smart lists are cards in a Reminders section of the rail', () => {
    render(<RemindersPage />);
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    const rail = screen.getByRole('complementary');
    const names = ['today', 'scheduled', 'overdue', 'flagged', 'all', 'completed'];
    const cards = names.map(id => within(rail).getByText(`reminders.smart.${id}`).closest('[role="button"]')!);
    expect(cards.every(Boolean)).toBe(true);
    expect(cards.every(c => c.parentElement === cards[0].parentElement)).toBe(true);
    expect(within(rail).getByText('panel.widget.reminders')).toBeTruthy();
    expect(within(rail).getByText('reminders.myLists')).toBeTruthy();
  });

  it('lays the cards out two per row, colors each icon from the category map, and shows counts', () => {
    render(<RemindersPage />);
    const rail = screen.getByRole('complementary');
    const grid = within(rail).getByText('reminders.smart.today').closest('[role="button"]')!.parentElement as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))');
    expect(grid.children).toHaveLength(6);
    const colors = Object.fromEntries(SMART_LISTS.map(id => [id, SMART_COLORS[id]]));
    for (const id of SMART_LISTS) {
      const icon = within(rail).getByText(`reminders.smart.${id}`).closest('[role="button"]')!.querySelector('span') as HTMLElement;
      expect(icon).toHaveStyle({ color: colors[id] });
    }
    expect(within(rail).getByText('reminders.smart.today').closest('[role="button"]')!.textContent).toContain('2');
    expect(within(rail).getByText('reminders.smart.overdue').closest('[role="button"]')!.textContent).toContain('1');
  });

  it('keeps My Lists as rows with an edit button, and smart cards without one', () => {
    render(<RemindersPage />);
    const rail = screen.getByRole('complementary');
    expect(within(rail).getByText('Home').closest('button')).toBeTruthy();
    expect(within(rail).queryByRole('button', { name: 'reminders.list.edit.button|reminders.smart.today' })).toBeNull();
    expect(within(rail).getByRole('button', { name: 'reminders.list.edit.button|Home' })).toBeTruthy();
  });

  it('selects exactly one row across both sections, and titles the pane with its plain name', () => {
    const { rerender } = render(<RemindersPage />);
    const pressed = () => screen.getAllByRole('button', { pressed: true }).map(b => b.textContent);
    expect(pressed()).toHaveLength(1);
    expect(pressed()[0]).toContain('reminders.smart.today');
    rerender(<RemindersPage tab="l2" />);
    expect(pressed()).toHaveLength(1);
    expect(pressed()[0]).toContain('Work');
    const header = (text: string, scope: HTMLElement) => within(scope).getByText(text).className.split(' ').find(c => c.includes('sectionHeader'));
    expect(header('reminders.myLists', screen.getByRole('complementary'))).toBeTruthy();
    expect(screen.getAllByText('Work').length).toBeGreaterThan(1);
  });

  it('colors a list icon directly with its list color and has no completed-count line', () => {
    render(<RemindersPage tab="l1" />);
    const glyph = within(screen.getByRole('complementary')).getByText('Home').closest('button')!.querySelector('span')!;
    expect(glyph).toHaveStyle({ color: '#0a84ff' });
    expect(screen.queryByText(/reminders\.completedCount/)).toBeNull();
    expect(screen.getByRole('switch', { name: 'reminders.showCompleted' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'reminders.clearCompleted' })).toBeNull();
  });

  it('puts Show Completed (lists only) and Clear Completed (Completed only) in the title row', () => {
    const { rerender } = render(<RemindersPage tab="l1" />);
    const titleRow = () => screen.getAllByText('Home').map(e => e.closest<HTMLElement>('[class*="toolbar"]')).find(Boolean)!;
    expect(within(titleRow()).getByRole('switch', { name: 'reminders.showCompleted' })).toBeTruthy();
    rerender(<RemindersPage tab="today" />);
    expect(screen.queryByRole('switch', { name: 'reminders.showCompleted' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'reminders.clearCompleted' })).toBeNull();
    rerender(<RemindersPage tab="completed" />);
    const row = screen.getByRole('button', { name: 'reminders.clearCompleted' }).closest<HTMLElement>('[class*="toolbar"]')!;
    expect(within(row).getByText('reminders.smart.completed')).toBeTruthy();
    expect(document.querySelector('[class*="subbar"]')).toBeNull();
  });

  it('reports a clicked smart row as the subtab', () => {
    const onTabChange = vi.fn();
    render(<RemindersPage onTabChange={onTabChange} />);
    fireEvent.click(screen.getByText('reminders.smart.flagged').closest('[role="button"]')!);
    expect(onTabChange).toHaveBeenCalledWith('flagged');
  });

  it('groups Scheduled by date', () => {
    render(<RemindersPage tab="scheduled" />);
    expect(screen.getByText('Sunday, November 15')).toBeTruthy();
    expect(screen.getByText('Thursday, November 19')).toBeTruthy();
  });

  it('selecting a list from the rail reports its key', () => {
    const onTabChange = vi.fn();
    render(<RemindersPage onTabChange={onTabChange} />);
    fireEvent.click(screen.getByText('Work').closest('button')!);
    expect(onTabChange).toHaveBeenCalledWith('l2');
  });

  it('adds a reminder inline to the shown list', () => {
    render(<RemindersPage tab="l2" />);
    typeInto(screen.getByRole('textbox', { name: 'reminders.new' }), '  Book flights ');
    expect(store.create).toHaveBeenCalledWith({ listId: 'l2', title: 'Book flights' });
  });

  it('gives a reminder added in Scheduled a due date of today', () => {
    render(<RemindersPage tab="scheduled" />);
    typeInto(screen.getByRole('textbox', { name: 'reminders.new' }), 'Plan trip');
    expect(store.create).toHaveBeenCalledWith({ listId: 'l1', dueDate: '2026-11-17', title: 'Plan trip' });
  });

  it('gives a reminder added in Today a due date of today', () => {
    render(<RemindersPage />);
    typeInto(screen.getByRole('textbox', { name: 'reminders.new' }), 'Stretch');
    expect(store.create).toHaveBeenCalledWith({ listId: 'l1', dueDate: '2026-11-17', title: 'Stretch' });
  });

  it('has no add row in Completed', () => {
    render(<RemindersPage tab="completed" />);
    expect(screen.queryByRole('textbox', { name: 'reminders.new' })).toBeNull();
    expect(screen.getByText('Finished chore')).toBeTruthy();
  });

  it('edits title and notes inline and saves on Enter', () => {
    render(<RemindersPage tab="l1" />);
    fireEvent.click(screen.getByText('Water plants'));
    const title = screen.getByLabelText('reminders.edit.title');
    fireEvent.input(title, { target: { value: 'Water the ferns' } });
    fireEvent.change(screen.getByLabelText('reminders.edit.notes'), { target: { value: 'Both windows' } });
    fireEvent.keyDown(title, { key: 'Enter' });
    expect(store.update).toHaveBeenCalledWith(store.items[0].id, { title: 'Water the ferns', notes: 'Both windows' });
    expect(screen.queryByLabelText('reminders.edit.title')).toBeNull();
  });

  it('discards an inline edit on Escape', () => {
    render(<RemindersPage tab="l1" />);
    fireEvent.click(screen.getByText('Water plants'));
    const title = screen.getByLabelText('reminders.edit.title');
    fireEvent.input(title, { target: { value: 'Changed' } });
    fireEvent.keyDown(title, { key: 'Escape' });
    expect(store.update).not.toHaveBeenCalled();
  });

  it('opens an editor from the keyboard on the row', () => {
    render(<RemindersPage tab="l1" />);
    fireEvent.keyDown(screen.getByText('Water plants').closest('[role="button"]')!, { key: 'Enter' });
    expect(screen.getByLabelText('reminders.edit.title')).toBeTruthy();
  });

  it('completes after the check animation', () => {
    render(<RemindersPage tab="l1" />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Water plants' }));
    expect(store.setCompleted).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(COMPLETE_DELAY_MS + 1); });
    expect(store.setCompleted).toHaveBeenCalledWith(store.items[0].id, true);
  });

  it('shows and hides completed items and remembers the choice', () => {
    const { unmount } = render(<RemindersPage tab="l1" />);
    expect(screen.queryByText('Finished chore')).toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: 'reminders.showCompleted' }));
    expect(screen.getByText('Finished chore')).toBeTruthy();
    unmount();
    render(<RemindersPage tab="l1" />);
    expect(screen.getByText('Finished chore')).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'reminders.showCompleted' }).getAttribute('aria-checked')).toBe('true');
  });

  it('clears all completed items from the Completed list after a confirm', async () => {
    render(<RemindersPage tab="completed" />);
    fireEvent.click(screen.getByRole('button', { name: 'reminders.clearCompleted' }));
    const dialog = screen.getByRole('alertdialog');
    expect(store.clearCompleted).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'reminders.clearCompleted.confirm' }));
    expect(store.clearCompleted).toHaveBeenCalledWith();
  });

  it('disables Clear completed when nothing is completed', () => {
    store.items = store.items.filter(i => !i.completed);
    render(<RemindersPage tab="completed" />);
    expect((screen.getByRole('button', { name: 'reminders.clearCompleted' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('adds a list from the rail and opens it', async () => {
    const onTabChange = vi.fn();
    render(<RemindersPage onTabChange={onTabChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'reminders.list.add.button' }));
    const dialog = await screen.findByRole('alertdialog');
    const buttons = within(dialog).getAllByRole('button').map(b => b.textContent);
    expect(buttons.indexOf('confirm.cancel')).toBeLessThan(buttons.indexOf('reminders.list.add.confirm'));
    fireEvent.input(within(dialog).getByLabelText('reminders.list.name'), { target: { value: 'Errands' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'reminders.list.add.confirm' }));
    await waitFor(() => expect(store.createList).toHaveBeenCalledWith(expect.objectContaining({ name: 'Errands', icon: 'list' })));
    await waitFor(() => expect(onTabChange).toHaveBeenCalledWith('made'));
  });

  it('offers the Icons and Emoji tabs only in the list editor and stores a picked deck icon', async () => {
    render(<RemindersPage />);
    fireEvent.click(screen.getByRole('button', { name: 'reminders.list.add.button' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('button', { name: 'panel.iconPicker.icons' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'panel.iconPicker.emoji' })).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'panel.iconPicker.auto' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'panel.iconPicker.custom' })).toBeNull();
    fireEvent.input(within(dialog).getByLabelText('reminders.list.name'), { target: { value: 'Launch' } });
    fireEvent.click(within(dialog).getByLabelText('Rocket'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'reminders.list.add.confirm' }));
    await waitFor(() => expect(store.createList).toHaveBeenCalledWith(expect.objectContaining({ name: 'Launch', icon: 'Rocket' })));
  });

  it('draws an emoji list icon as its glyph in the rail', () => {
    store.lists = [...store.lists, { ...list('l3', 'Shopping', 2), icon: 'emoji:🛒' }];
    render(<RemindersPage />);
    const row = within(screen.getByRole('complementary')).getByText('Shopping').closest('button')!;
    expect(within(row).getByText('🛒')).toBeTruthy();
    expect(row.querySelector('svg')).toBeNull();
  });

  it('edits a list and deletes it after a confirm, leaving it for Today', async () => {
    const onTabChange = vi.fn();
    render(<RemindersPage tab="l2" onTabChange={onTabChange} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'reminders.list.edit.button|Work' })[0]);
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'reminders.list.delete.title' }));
    const confirm = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'reminders.list.delete.confirm' }));
    await waitFor(() => expect(store.deleteList).toHaveBeenCalledWith('l2'));
    await waitFor(() => expect(onTabChange).toHaveBeenCalledWith('today'));
  });

  it('saves details as a patch of only what changed', async () => {
    render(<RemindersPage tab="l1" />);
    fireEvent.click(screen.getByRole('button', { name: 'reminders.details.open|Water plants' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByLabelText('reminders.priority.medium'));
    fireEvent.click(within(dialog).getByRole('switch', { name: 'reminders.details.flag' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'reminders.details.save' }));
    await waitFor(() => expect(store.update).toHaveBeenCalledWith(store.items[0].id, { priority: 2, flagged: true }));
  });

  it('deletes a reminder from its details', async () => {
    render(<RemindersPage tab="l1" />);
    fireEvent.click(screen.getByRole('button', { name: 'reminders.details.open|Water plants' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'reminders.details.delete' }));
    await waitFor(() => expect(store.remove).toHaveBeenCalledWith(store.items[0].id));
  });

  it('blocks saving a malformed URL', async () => {
    render(<RemindersPage tab="l1" />);
    fireEvent.click(screen.getByRole('button', { name: 'reminders.details.open|Water plants' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.input(within(dialog).getByLabelText('reminders.details.url'), { target: { value: 'javascript:alert(1)' } });
    expect(within(dialog).getByText('reminders.details.urlInvalid')).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: 'reminders.details.save' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows an error notice instead of an empty list while the service is unavailable', () => {
    store.unavailable = true;
    store.items = [];
    render(<RemindersPage />);
    expect(screen.getByRole('alert').textContent).toContain('reminders.error.unavailable');
    expect(screen.queryByRole('textbox', { name: 'reminders.new' })).toBeNull();
  });

  it('keeps typing and Enter in the inline editor from starting a keyboard drag', () => {
    render(<RemindersPage tab="l1" />);
    fireEvent.click(screen.getByText('Water plants'));
    const title = screen.getByLabelText('reminders.edit.title');
    const notes = screen.getByLabelText('reminders.edit.notes');
    expect(fireEvent.keyDown(title, { key: ' ', code: 'Space' })).toBe(true);
    expect(fireEvent.keyDown(notes, { key: ' ', code: 'Space' })).toBe(true);
    expect(fireEvent.keyDown(notes, { key: 'Enter', code: 'Enter' })).toBe(true);
    fireEvent.input(title, { target: { value: 'Water the ferns' } });
    expect(fireEvent.keyDown(title, { key: 'Enter', code: 'Enter' })).toBe(true);
    expect(store.update).toHaveBeenCalledWith(store.items[0].id, { title: 'Water the ferns' });
  });

  it('keeps Space and Enter on the check circle and the details button for the buttons themselves', () => {
    render(<RemindersPage tab="l1" />);
    const check = screen.getByRole('checkbox', { name: 'Water plants' });
    expect(fireEvent.keyDown(check, { key: ' ', code: 'Space' })).toBe(true);
    expect(fireEvent.keyDown(check, { key: 'Enter', code: 'Enter' })).toBe(true);
    expect(fireEvent.keyDown(screen.getByRole('button', { name: 'reminders.details.open|Water plants' }), { key: 'Enter', code: 'Enter' })).toBe(true);
    fireEvent.click(check);
    act(() => { vi.advanceTimersByTime(COMPLETE_DELAY_MS + 1); });
    expect(store.setCompleted).toHaveBeenCalledWith(store.items[0].id, true);
  });

  it('leaves rows and lists without a service id inert', () => {
    store.lists = [...store.lists, list('pending-list-1', 'Brand new', 2)];
    store.items = [item('l1', 'Just added', { id: 'pending-item-1' })];
    render(<RemindersPage tab="l1" />);
    expect((screen.getByRole('checkbox', { name: 'Just added' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'reminders.details.open|Just added' })).toBeNull();
    fireEvent.click(screen.getByText('Just added'));
    expect(screen.queryByLabelText('reminders.edit.title')).toBeNull();
    expect(screen.getByText('Brand new').closest('button')).toBeNull();
  });

  it('shows a spinner instead of the empty state until loaded', () => {
    store.loaded = false;
    store.lists = [];
    store.items = [];
    render(<RemindersPage />);
    expect(screen.getByRole('img', { name: 'common.loading' })).toBeTruthy();
    expect(screen.queryByText('reminders.empty.noLists')).toBeNull();
  });

  it('renders community strings as text, never markup', () => {
    store.items = [item('l1', '<img src=x onerror=alert(1)>', { notes: '<b>bold</b>' })];
    const { container } = render(<RemindersPage tab="l1" />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
  });
});

describe('reminder details helpers', () => {
  const base = item('l1', 'x', { dueDate: '2026-11-17', dueTime: '10:00', url: 'https://a.example' });
  const same = { dueDate: base.dueDate, dueTime: base.dueTime, priority: base.priority, flagged: base.flagged, url: 'https://a.example', listId: 'l1' } as const;

  it('diffs a draft against the item', () => {
    expect(detailsPatch(base, same)).toEqual({});
    expect(detailsPatch(base, { ...same, dueDate: null, dueTime: '10:00' })).toEqual({ dueDate: null, dueTime: null });
    expect(detailsPatch(base, { ...same, url: '  ', listId: 'l2' })).toEqual({ url: null, listId: 'l2' });
    expect(detailsPatch(base, { ...same, dueTime: null })).toEqual({ dueTime: null });
  });

  it('accepts only absolute http and https addresses', () => {
    expect(isWebUrl('')).toBe(true);
    expect(isWebUrl('https://example.com/a?b=1')).toBe(true);
    expect(isWebUrl('ftp://example.com')).toBe(false);
    expect(isWebUrl('javascript:alert(1)')).toBe(false);
    expect(isWebUrl('example.com')).toBe(false);
  });
});
