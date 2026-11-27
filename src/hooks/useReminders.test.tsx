import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MultiplexContext, type MultiplexContextValue } from './useMultiplexSocket';
import { resetRemindersStore, useReminderMutations, useReminders } from './useReminders';
import type { ReminderDto, ReminderListDto } from '../api/reminders';

const api = vi.hoisted(() => ({
  fetchReminders: vi.fn(),
  createReminder: vi.fn(),
  updateReminder: vi.fn(),
  deleteReminder: vi.fn(),
  createReminderList: vi.fn(),
  updateReminderList: vi.fn(),
  deleteReminderList: vi.fn(),
  clearCompletedReminders: vi.fn(),
  reorderReminders: vi.fn(),
}));

vi.mock('../api/reminders', async importOriginal => ({
  ...(await importOriginal<typeof import('../api/reminders')>()),
  ...api,
  subscribeRemindersMock: () => () => {},
}));

const list = (id: string, order: number): ReminderListDto => ({ id, name: id, color: '#112233', icon: 'list', order, createdAt: order });
const dto = (id: string, extra: Partial<ReminderDto> = {}): ReminderDto => ({
  id, listId: 'l1', title: id, notes: null, dueDate: null, dueTime: null, priority: 0, flagged: false, completed: false,
  completedAt: null, url: null, order: 0, createdAt: 1, updatedAt: 1, ...extra,
});

const listeners = new Map<string, Set<(raw: unknown) => void>>();
const multiplex = {
  subscribe: (topic: string, fn: (raw: unknown) => void) => {
    if (!listeners.has(topic)) listeners.set(topic, new Set());
    listeners.get(topic)!.add(fn);
  },
  unsubscribe: (topic: string, fn: (raw: unknown) => void) => { listeners.get(topic)?.delete(fn); },
  connected: true,
} as unknown as MultiplexContextValue;

const wrapper = ({ children }: { children: ReactNode }) => (
  <MultiplexContext.Provider value={multiplex}>{children}</MultiplexContext.Provider>
);

beforeEach(() => {
  resetRemindersStore();
  listeners.clear();
  api.fetchReminders.mockResolvedValue({ lists: [list('l2', 1), list('l1', 0)], items: [dto('a'), dto('b')] });
});

afterEach(() => {
  Object.values(api).forEach(fn => fn.mockReset());
});

const mount = () => renderHook(() => ({ data: useReminders(), mut: useReminderMutations() }), { wrapper });

describe('reminders store when the service is unavailable', () => {
  it('flags unavailable instead of an empty list, then retries after the delay and on a ping', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    try {
      const { ReminderRequestError } = await import('../api/reminders');
      api.fetchReminders.mockRejectedValue(new ReminderRequestError('x', 'unavailable'));
      const { result } = renderHook(() => useReminders(), { wrapper });
      await waitFor(() => expect(result.current.unavailable).toBe(true));
      expect(result.current.items).toEqual([]);
      api.fetchReminders.mockResolvedValue({ lists: [list('l1', 0)], items: [dto('a')] });
      await act(async () => { vi.advanceTimersByTime(15_000); });
      await waitFor(() => expect(result.current.unavailable).toBe(false));
      expect(result.current.items.map(i => i.id)).toEqual(['a']);
      api.fetchReminders.mockRejectedValue(new ReminderRequestError('x', 'unavailable'));
      await act(async () => { listeners.get('reminders')?.forEach(fn => fn({})); });
      await waitFor(() => expect(result.current.unavailable).toBe(true));
      api.fetchReminders.mockResolvedValue({ lists: [list('l1', 0)], items: [] });
      await act(async () => { listeners.get('reminders')?.forEach(fn => fn({})); });
      await waitFor(() => expect(result.current.unavailable).toBe(false));
    } finally {
      vi.useRealTimers();
    }
  });

  it('rolls back a write refused as unavailable and flags the store', async () => {
    const { result } = renderHook(() => ({ data: useReminders(), mut: useReminderMutations() }), { wrapper });
    await waitFor(() => expect(result.current.data.loaded).toBe(true));
    const { ReminderRequestError } = await import('../api/reminders');
    api.updateReminder.mockRejectedValue(new ReminderRequestError('x', 'unavailable'));
    api.fetchReminders.mockRejectedValue(new ReminderRequestError('x', 'unavailable'));
    await act(async () => { await expect(result.current.mut.update('a', { title: 'z' })).rejects.toThrow(); });
    expect(result.current.data.unavailable).toBe(true);
  });
});

describe('reminders store', () => {
  it('loads once for several consumers and orders the lists', async () => {
    const { result } = renderHook(() => ({ one: useReminders(), two: useReminders() }), { wrapper });
    await waitFor(() => expect(result.current.one.loaded).toBe(true));
    expect(api.fetchReminders).toHaveBeenCalledTimes(1);
    expect(result.current.two.lists.map(l => l.id)).toEqual(['l1', 'l2']);
  });

  it('refetches the canonical copy on a reminders frame', async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.data.loaded).toBe(true));
    api.fetchReminders.mockResolvedValue({ lists: [list('l1', 0)], items: [dto('fresh')] });
    await act(async () => { listeners.get('reminders')?.forEach(fn => fn({})); });
    await waitFor(() => expect(result.current.data.items.map(i => i.id)).toEqual(['fresh']));
  });

  it('applies a completion at once and keeps it when the write succeeds', async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.data.loaded).toBe(true));
    let release!: () => void;
    api.updateReminder.mockImplementation(() => new Promise<void>(r => { release = r; }));
    let job!: Promise<void>;
    act(() => { job = result.current.mut.setCompleted('a', true); });
    expect(result.current.data.items.find(i => i.id === 'a')?.completed).toBe(true);
    api.fetchReminders.mockResolvedValue({ lists: [list('l1', 0)], items: [dto('a', { completed: true, completedAt: 5 }), dto('b')] });
    await act(async () => { release(); await job; });
    expect(api.updateReminder).toHaveBeenCalledWith('a', { completed: true });
    await waitFor(() => expect(result.current.data.items.find(i => i.id === 'a')?.completedAt).toBe(5));
  });

  it('rolls an optimistic write back when it fails', async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.data.loaded).toBe(true));
    api.updateReminder.mockRejectedValue(new Error('refused'));
    await act(async () => { await expect(result.current.mut.update('a', { title: 'renamed' })).rejects.toThrow('refused'); });
    expect(result.current.data.items.find(i => i.id === 'a')?.title).toBe('a');
  });

  it('drops a fetch that lands while a write is in flight', async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.data.loaded).toBe(true));
    let release!: () => void;
    api.deleteReminder.mockImplementation(() => new Promise<void>(r => { release = r; }));
    let job!: Promise<void>;
    act(() => { job = result.current.mut.remove('a'); });
    await act(async () => { listeners.get('reminders')?.forEach(fn => fn({})); await Promise.resolve(); await Promise.resolve(); });
    expect(result.current.data.items.map(i => i.id)).toEqual(['b']);
    api.fetchReminders.mockResolvedValue({ lists: [list('l1', 0)], items: [dto('b')] });
    await act(async () => { release(); await job; });
  });

  it('shows a created item at once and swaps in the service copy', async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.data.loaded).toBe(true));
    api.createReminder.mockResolvedValue(dto('real', { title: 'New' }));
    api.fetchReminders.mockResolvedValue({ lists: [list('l1', 0)], items: [dto('real', { title: 'New' })] });
    await act(async () => { await result.current.mut.create({ listId: 'l1', title: 'New' }); });
    await waitFor(() => expect(result.current.data.items.map(i => i.id)).toEqual(['real']));
  });

  it('removes a deleted list and its items optimistically, and restores them on a refusal', async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.data.loaded).toBe(true));
    api.deleteReminderList.mockRejectedValue(new Error('lastList'));
    await act(async () => { await expect(result.current.mut.deleteList('l1')).rejects.toThrow(); });
    expect(result.current.data.lists.map(l => l.id)).toEqual(['l1', 'l2']);
    expect(result.current.data.items).toHaveLength(2);
  });

  it('reorders in place and sends the new id order', async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.data.loaded).toBe(true));
    api.reorderReminders.mockResolvedValue(undefined);
    await act(async () => { await result.current.mut.reorder('l1', ['b', 'a']); });
    expect(api.reorderReminders).toHaveBeenCalledWith('l1', ['b', 'a']);
  });

  it('sends the list\'s whole item set, completed items after the shown ones', async () => {
    api.fetchReminders.mockResolvedValue({
      lists: [list('l1', 0)],
      items: [dto('a', { order: 0 }), dto('done', { order: 1, completed: true, completedAt: 3 }), dto('b', { order: 2 })],
    });
    const { result } = mount();
    await waitFor(() => expect(result.current.data.loaded).toBe(true));
    api.reorderReminders.mockResolvedValue(undefined);
    await act(async () => { await result.current.mut.reorder('l1', ['b', 'a']); });
    expect(api.reorderReminders).toHaveBeenCalledWith('l1', ['b', 'a', 'done']);
  });

  it('drops a reorder the service calls stale and refetches', async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.data.loaded).toBe(true));
    const { ReminderRequestError } = await import('../api/reminders');
    api.reorderReminders.mockRejectedValue(new ReminderRequestError('stale', 'stale'));
    api.fetchReminders.mockClear();
    await act(async () => { await result.current.mut.reorder('l1', ['b', 'a']); });
    await waitFor(() => expect(api.fetchReminders).toHaveBeenCalled());
    expect(result.current.data.items.map(i => i.id)).toEqual(['a', 'b']);
  });
});
