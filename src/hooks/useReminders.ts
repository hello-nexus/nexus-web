import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import {
  clearCompletedReminders, createReminder, createReminderList, deleteReminder, deleteReminderList, fetchReminders,
  reorderReminders, subscribeRemindersMock, updateReminder, updateReminderList,
  type NewReminderInput, type NewReminderListInput, type ReminderDto, type ReminderListDto, type ReminderListPatch,
  type ReminderPatch, ReminderRequestError,
} from '../api/reminders';
import { applyItemPatch, applyReorder, sortLists } from '../panel/widgets/reminders/reminderLogic';
import { useMultiplex, useTopicCallback } from './useMultiplexSocket';

// One shared store for every reminders surface, so several tiles and the page
// make one request, and one `reminders` frame refreshes them all.

interface RemindersState {
  lists: ReminderListDto[];
  items: ReminderDto[];
  // True once the first fetch settled, whatever its outcome.
  loaded: boolean;
  // The service cannot read its store: views show an error state, not an empty list.
  unavailable: boolean;
}

const EMPTY: RemindersState = { lists: [], items: [], loaded: false, unavailable: false };
const RETRY_MS = 15_000;
let retryTimer: number | null = null;
let state: RemindersState = EMPTY;
const listeners = new Set<() => void>();
let users = 0;
let stopMock: (() => void) | null = null;
let generation = 0;
// Optimistic writes in flight: a fetch that lands meanwhile would undo them, so it is dropped and the write's own refetch follows.
let pendingWrites = 0;
let tempId = 0;

function setState(patch: Partial<RemindersState>) {
  state = { ...state, ...patch };
  listeners.forEach(l => l());
}

async function load() {
  const mine = ++generation;
  try {
    const snap = await fetchReminders();
    if (mine !== generation || pendingWrites > 0) return;
    clearRetry();
    setState({ lists: snap.lists, items: snap.items, loaded: true, unavailable: false });
  } catch (e) {
    if (mine !== generation) return;
    if (isUnavailable(e)) markUnavailable();
    else setState({ loaded: true });
  }
}

const isUnavailable = (e: unknown) => e instanceof ReminderRequestError && e.code === 'unavailable';

function clearRetry() {
  if (retryTimer !== null) window.clearTimeout(retryTimer);
  retryTimer = null;
}

/** Shows the error state and retries in a while; a topic ping retries sooner. */
function markUnavailable() {
  setState({ loaded: true, unavailable: true });
  clearRetry();
  if (users > 0) retryTimer = window.setTimeout(() => { retryTimer = null; invalidateReminders(); }, RETRY_MS);
}

let invalidatePending = false;

/** Refetches the lists and items; calls in one tick coalesce. */
export function invalidateReminders(): void {
  if (invalidatePending) return;
  invalidatePending = true;
  void Promise.resolve().then(() => {
    invalidatePending = false;
    void load();
  });
}

function retain() {
  users++;
  if (users === 1) {
    void load();
    stopMock = subscribeRemindersMock(invalidateReminders);
  }
}

function release() {
  users--;
  if (users === 0) {
    stopMock?.();
    stopMock = null;
    clearRetry();
  }
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const getState = () => state;

/** Test seam: forget everything the store holds. */
export function resetRemindersStore(): void {
  state = EMPTY;
  invalidatePending = false;
  users = 0;
  generation++;
  pendingWrites = 0;
  tempId = 0;
  clearRetry();
  stopMock?.();
  stopMock = null;
}

/** Applies `optimistic` now, runs the request, and restores the pre-write copy when it fails. */
async function write<T>(optimistic: (s: RemindersState) => Partial<RemindersState>, request: () => Promise<T>): Promise<T> {
  const before = state;
  pendingWrites++;
  setState(optimistic(state));
  try {
    return await request();
  } catch (e) {
    setState({ lists: before.lists, items: before.items });
    if (isUnavailable(e)) markUnavailable();
    throw e;
  } finally {
    pendingWrites--;
    invalidateReminders();
  }
}

export interface UseReminders {
  lists: ReminderListDto[];
  items: ReminderDto[];
  loaded: boolean;
  unavailable: boolean;
}

/** Mounts the shared fetch + push wiring for one consumer. */
export function useReminders(enabled = true): UseReminders {
  const connected = useMultiplex()?.connected ?? false;
  useEffect(() => {
    if (!enabled) return;
    retain();
    return release;
  }, [enabled]);
  useTopicCallback('reminders', enabled, invalidateReminders);
  const wasConnected = useRef(connected);
  useEffect(() => {
    // A dropped socket misses pushes, so a reconnect resyncs from the service.
    if (enabled && connected && !wasConnected.current) invalidateReminders();
    wasConnected.current = connected;
  }, [enabled, connected]);
  const snap = useSyncExternalStore(subscribe, getState);
  const lists = useMemo(() => sortLists(snap.lists), [snap.lists]);
  return { lists, items: snap.items, loaded: snap.loaded, unavailable: snap.unavailable };
}

export interface ReminderMutations {
  createList: (input: NewReminderListInput) => Promise<ReminderListDto>;
  updateList: (id: string, patch: ReminderListPatch) => Promise<void>;
  deleteList: (id: string) => Promise<void>;
  create: (input: NewReminderInput) => Promise<ReminderDto>;
  update: (id: string, patch: ReminderPatch) => Promise<void>;
  setCompleted: (id: string, completed: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clearCompleted: (listId?: string) => Promise<void>;
  reorder: (listId: string, itemIds: string[]) => Promise<void>;
}

export function useReminderMutations(): ReminderMutations {
  const update = useCallback((id: string, patch: ReminderPatch) => write(
    s => ({ items: s.items.map(i => (i.id === id ? applyItemPatch(i, patch, Date.now()) : i)) }),
    () => updateReminder(id, patch),
  ).then(() => undefined), []);
  return useMemo(() => ({
    createList: async input => {
      const temp = `pending-list-${++tempId}`;
      const list = await write(
        s => ({ lists: [...s.lists, { id: temp, ...input, order: s.lists.reduce((m, l) => Math.max(m, l.order), -1) + 1, createdAt: Date.now() }] }),
        () => createReminderList(input),
      );
      setState({ lists: state.lists.map(l => (l.id === temp ? list : l)) });
      return list;
    },
    updateList: (id, patch) => write(
      s => ({ lists: s.lists.map(l => (l.id === id ? { ...l, ...patch } : l)) }),
      () => updateReminderList(id, patch),
    ).then(() => undefined),
    deleteList: id => write(
      s => ({ lists: s.lists.filter(l => l.id !== id), items: s.items.filter(i => i.listId !== id) }),
      () => deleteReminderList(id),
    ),
    create: async input => {
      const temp = `pending-item-${++tempId}`;
      const now = Date.now();
      const item = await write(
        s => ({
          items: [...s.items, {
            id: temp, listId: input.listId, title: input.title, notes: input.notes ?? null, dueDate: input.dueDate ?? null,
            dueTime: input.dueDate ? input.dueTime ?? null : null, priority: input.priority ?? 0, flagged: input.flagged ?? false,
            completed: false, completedAt: null, url: input.url ?? null,
            order: s.items.filter(i => i.listId === input.listId).reduce((m, i) => Math.max(m, i.order), -1) + 1,
            createdAt: now, updatedAt: now,
          }],
        }),
        () => createReminder(input),
      );
      setState({ items: state.items.map(i => (i.id === temp ? item : i)) });
      return item;
    },
    update,
    setCompleted: (id, completed) => update(id, { completed }),
    remove: id => write(s => ({ items: s.items.filter(i => i.id !== id) }), () => deleteReminder(id)),
    clearCompleted: listId => write(
      s => ({ items: s.items.filter(i => !(i.completed && (listId === undefined || i.listId === listId))) }),
      () => clearCompletedReminders(listId),
    ).then(() => undefined),
    reorder: async (listId, shownIds) => {
      // The service takes the list's whole item set: the shown order first, then the rest (completed items) in their order.
      const rest = state.items.filter(i => i.listId === listId && !shownIds.includes(i.id)).sort((a, b) => a.order - b.order).map(i => i.id);
      const itemIds = [...shownIds, ...rest];
      try {
        await write(s => ({ items: applyReorder(s.items, listId, itemIds) }), () => reorderReminders(listId, itemIds));
      } catch (e) {
        // A stale set means the list changed under the drag: the refetch the write queued is the answer.
        if (!(e instanceof ReminderRequestError && e.code === 'stale')) throw e;
      }
    },
  }), [update]);
}
