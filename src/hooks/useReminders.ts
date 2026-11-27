import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import {
  clearCompletedReminders, createReminder, createReminderList, deleteReminder, deleteReminderList, fetchReminders,
  reorderReminders, subscribeRemindersMock, updateReminder, updateReminderList,
  type NewReminderInput, type NewReminderListInput, type ReminderDto, type ReminderListDto, type ReminderListPatch,
  type ReminderPatch, ReminderRequestError,
} from '../api/reminders';
import { applyItemPatch, applyReorder, PENDING_PREFIX, sortLists } from '../panel/widgets/reminders/reminderLogic';
import { useMultiplex, useTopicCallback } from './useMultiplexSocket';

// One shared store for every reminders surface, so several tiles and the page
// make one request, and one `reminders` frame refreshes them all.

interface Snap { lists: ReminderListDto[]; items: ReminderDto[] }

interface RemindersState extends Snap {
  // True once the first fetch settled, whatever its outcome.
  loaded: boolean;
  // The last fetch failed: views show an error state, never an empty list.
  unavailable: boolean;
}

// An in-flight write: `apply` shows it optimistically; `commit` folds its result into the server copy once it succeeds.
interface Op {
  apply: (s: Snap) => Snap;
  commit: (s: Snap, result: unknown) => Snap;
}

const EMPTY: RemindersState = { lists: [], items: [], loaded: false, unavailable: false };
const RETRY_MS = 15_000;
let retryTimer: number | null = null;
let state: RemindersState = EMPTY;
// The last copy the service sent; `state` is that copy with every in-flight write applied on top, so a failed write undoes only itself.
let server: Snap = { lists: [], items: [] };
let ops: Op[] = [];
let commits = 0;
const listeners = new Set<() => void>();
let users = 0;
let stopMock: (() => void) | null = null;
let generation = 0;
let tempId = 0;

function setState(patch: Partial<RemindersState>) {
  state = { ...state, ...patch };
  listeners.forEach(l => l());
}

function rebuild() {
  const view = ops.reduce((snap, op) => op.apply(snap), server);
  setState({ lists: view.lists, items: view.items });
}

async function load() {
  const mine = ++generation;
  const startedAt = commits;
  try {
    const snap = await fetchReminders();
    // A write committed while this was in flight: the copy may predate it, and that write's own refetch is already queued.
    if (mine !== generation || startedAt !== commits) return;
    clearRetry();
    server = snap;
    setState({ loaded: true, unavailable: false });
    rebuild();
  } catch {
    if (mine === generation) markUnavailable();
  }
}

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
  server = { lists: [], items: [] };
  ops = [];
  commits = 0;
  invalidatePending = false;
  users = 0;
  generation++;
  tempId = 0;
  clearRetry();
  stopMock?.();
  stopMock = null;
}

/** Shows `apply` at once, runs the request, folds the result into the server copy on success and drops only this write's change on failure. */
async function write<T>(apply: Op['apply'], request: () => Promise<T>, commit?: (s: Snap, result: T) => Snap): Promise<T> {
  const op: Op = { apply, commit: (commit as Op['commit'] | undefined) ?? (s => apply(s)) };
  ops.push(op);
  rebuild();
  try {
    const result = await request();
    server = op.commit(server, result);
    commits++;
    return result;
  } catch (e) {
    if (e instanceof ReminderRequestError && e.code === 'unavailable') markUnavailable();
    throw e;
  } finally {
    ops = ops.filter(o => o !== op);
    rebuild();
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
  /** `shownIds` is the list's open items in their new order; the whole set the service needs is built from the server copy. */
  reorder: (listId: string, shownIds: string[]) => Promise<void>;
}

const nextOrder = (rows: readonly { order: number }[]) => rows.reduce((m, r) => Math.max(m, r.order), -1) + 1;

export function useReminderMutations(): ReminderMutations {
  const update = useCallback((id: string, patch: ReminderPatch) => write(
    s => ({ ...s, items: s.items.map(i => (i.id === id ? applyItemPatch(i, patch, Date.now()) : i)) }),
    () => updateReminder(id, patch),
  ).then(() => undefined), []);
  return useMemo(() => ({
    createList: input => {
      const temp = `${PENDING_PREFIX}list-${++tempId}`;
      return write(
        s => ({ ...s, lists: [...s.lists, { id: temp, ...input, order: nextOrder(s.lists), createdAt: Date.now() }] }),
        () => createReminderList(input),
        (s, list) => ({ ...s, lists: s.lists.some(l => l.id === list.id) ? s.lists : [...s.lists, list] }),
      );
    },
    updateList: (id, patch) => write(
      s => ({ ...s, lists: s.lists.map(l => (l.id === id ? { ...l, ...patch } : l)) }),
      () => updateReminderList(id, patch),
    ).then(() => undefined),
    deleteList: id => write(
      s => ({ lists: s.lists.filter(l => l.id !== id), items: s.items.filter(i => i.listId !== id) }),
      () => deleteReminderList(id),
    ),
    create: input => {
      const temp = `${PENDING_PREFIX}item-${++tempId}`;
      const now = Date.now();
      return write(
        s => ({
          ...s,
          items: [...s.items, {
            id: temp, listId: input.listId, title: input.title, notes: input.notes ?? null, dueDate: input.dueDate ?? null,
            dueTime: input.dueDate ? input.dueTime ?? null : null, priority: input.priority ?? 0, flagged: input.flagged ?? false,
            completed: false, completedAt: null, url: input.url ?? null,
            order: nextOrder(s.items.filter(i => i.listId === input.listId)), createdAt: now, updatedAt: now,
          }],
        }),
        () => createReminder(input),
        (s, item) => ({ ...s, items: s.items.some(i => i.id === item.id) ? s.items : [...s.items, item] }),
      );
    },
    update,
    setCompleted: (id, completed) => update(id, { completed }),
    remove: id => write(s => ({ ...s, items: s.items.filter(i => i.id !== id) }), () => deleteReminder(id)),
    clearCompleted: listId => write(
      s => ({ ...s, items: s.items.filter(i => !(i.completed && (listId === undefined || i.listId === listId))) }),
      () => clearCompletedReminders(listId),
    ).then(() => undefined),
    reorder: (listId, shownIds) => {
      const mine = server.items.filter(i => i.listId === listId);
      const known = new Set(mine.map(i => i.id));
      const shown = shownIds.filter(id => known.has(id));
      const rest = mine.filter(i => !shown.includes(i.id)).sort((a, b) => a.order - b.order).map(i => i.id);
      const itemIds = [...shown, ...rest];
      return write(
        s => ({ ...s, items: applyReorder(s.items, listId, itemIds) }),
        () => reorderReminders(listId, itemIds),
      );
    },
  }), [update]);
}
