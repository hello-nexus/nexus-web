// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearCompletedReminders, createReminder, createReminderList, deleteReminderList, fetchReminders, ReminderRequestError,
  reorderReminders, updateReminder,
} from './reminders';

const service = vi.hoisted(() => ({ authFetchWithStatus: vi.fn() }));
vi.mock('./service', () => service);

const json = (body: unknown, status = 200) => ({ response: new Response(JSON.stringify(body), { status }), status });
const noRoute = () => ({ response: new Response('', { status: 404 }), status: 404 });

beforeEach(() => service.authFetchWithStatus.mockReset());

describe('reminders api client', () => {
  it('reads the snapshot from the service route', async () => {
    service.authFetchWithStatus.mockResolvedValueOnce(json({ lists: [{ id: 'a' }], items: [] }));
    expect((await fetchReminders()).lists).toEqual([{ id: 'a' }]);
    expect(service.authFetchWithStatus).toHaveBeenCalledWith('/api/reminders', { method: 'GET', body: undefined });
  });

  it('sends each write to its route with the contract body', async () => {
    service.authFetchWithStatus.mockResolvedValue(json({}));
    await createReminderList({ name: 'A', color: '#112233', icon: 'list' });
    await updateReminder('i 1', { completed: true, dueDate: null });
    await deleteReminderList('l1');
    await clearCompletedReminders();
    await reorderReminders('l1', ['b', 'a']);
    await createReminder({ listId: 'l1', title: 'T' });
    expect(service.authFetchWithStatus.mock.calls).toEqual([
      ['/api/reminders/lists', { method: 'POST', body: { name: 'A', color: '#112233', icon: 'list' } }],
      ['/api/reminders/items/i%201', { method: 'PUT', body: { completed: true, dueDate: null } }],
      ['/api/reminders/lists/l1', { method: 'DELETE', body: undefined }],
      ['/api/reminders/items/clear-completed', { method: 'POST', body: {} }],
      ['/api/reminders/reorder', { method: 'POST', body: { listId: 'l1', itemIds: ['b', 'a'] } }],
      ['/api/reminders/items', { method: 'POST', body: { listId: 'l1', title: 'T' } }],
    ]);
  });

  it('falls back to the dev fixtures when the service has no reminders routes', async () => {
    service.authFetchWithStatus.mockResolvedValue(noRoute());
    const snap = await fetchReminders();
    expect(snap.lists.length).toBeGreaterThan(0);
    const created = await createReminder({ listId: snap.lists[0].id, title: '  Mocked  ' });
    expect(created.title).toBe('Mocked');
    expect((await fetchReminders()).items.some(i => i.id === created.id)).toBe(true);
    const done = await updateReminder(created.id, { completed: true });
    expect(done.completed).toBe(true);
    expect(done.completedAt).not.toBeNull();
  });

  it('keeps a coded 404 as an error instead of reading it as a missing route', async () => {
    service.authFetchWithStatus.mockResolvedValue(json({ code: 'notFound' }, 404));
    await expect(updateReminder('gone', { flagged: true })).rejects.toMatchObject({ code: 'notFound' });
  });

  it('carries the service error code', async () => {
    service.authFetchWithStatus.mockResolvedValueOnce(json({ code: 'limitReached' }, 400));
    await expect(createReminder({ listId: 'l', title: 't' })).rejects.toBeInstanceOf(ReminderRequestError);
    service.authFetchWithStatus.mockResolvedValueOnce(json({ code: 'lastList' }, 409));
    await expect(deleteReminderList('l')).rejects.toMatchObject({ code: 'lastList' });
    service.authFetchWithStatus.mockResolvedValueOnce({ response: new Response('', { status: 500 }), status: 500 });
    await expect(fetchReminders()).rejects.toMatchObject({ code: null });
  });
});

describe('reminders dev mock rules', () => {
  beforeEach(() => service.authFetchWithStatus.mockResolvedValue(noRoute()));

  it('enforces the service field rules', async () => {
    const [list] = (await fetchReminders()).lists;
    await expect(createReminder({ listId: list.id, title: '   ' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(createReminder({ listId: list.id, title: 'x', url: 'ftp://a.b' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(createReminder({ listId: list.id, title: 'x', dueTime: '09:00' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(createReminder({ listId: 'nope', title: 'x' })).rejects.toMatchObject({ code: 'notFound' });
    await expect(createReminderList({ name: 'x', color: 'red', icon: 'list' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(createReminderList({ name: 'x', color: '#112233', icon: 'bad icon' })).rejects.toMatchObject({ code: 'invalid' });
  });

  it('accepts a Lucide name or an emoji icon and refuses a malformed one', async () => {
    const mk = (icon: string) => createReminderList({ name: 'Icons', color: '#112233', icon });
    expect((await mk('Rocket')).icon).toBe('Rocket');
    expect((await mk('emoji:🛒')).icon).toBe('emoji:🛒');
    expect((await mk('emoji:👨\u200d👩\u200d👧\u200d👦')).icon).toContain('emoji:');
    await expect(mk('emoji:')).rejects.toMatchObject({ code: 'invalid' });
    await expect(mk('emoji:a b')).rejects.toMatchObject({ code: 'invalid' });
    await expect(mk('emoji:\u200d')).rejects.toMatchObject({ code: 'invalid' });
    await expect(mk('emoji:\ufe0f\u200d')).rejects.toMatchObject({ code: 'invalid' });
    await expect(mk('emoji:a\u200bb')).rejects.toMatchObject({ code: 'invalid' });
    await expect(mk(`emoji:${'a'.repeat(33)}`)).rejects.toMatchObject({ code: 'invalid' });
    expect((await mk('emoji:\u2764\ufe0f')).icon).toContain('emoji:');
    expect((await mk('emoji:\ud83c\udff4\udb40\udc67\udb40\udc62\udb40\udc65\udb40\udc6e\udb40\udc67\udb40\udc7f')).icon).toContain('emoji:');
    await expect(mk('emoji:\ue000')).rejects.toMatchObject({ code: 'invalid' });
    await expect(mk(`emoji:${'\ud83d'}`)).rejects.toMatchObject({ code: 'invalid' });
    await expect(mk('emoji:\udb40\udc67')).rejects.toMatchObject({ code: 'invalid' });
    await expect(mk('bad icon')).rejects.toMatchObject({ code: 'invalid' });
  });

  it('clears dueTime with dueDate and moves a re-listed item to the end', async () => {
    const snap = await fetchReminders();
    const [a, b] = snap.lists;
    const item = await createReminder({ listId: a.id, title: 'timed', dueDate: '2030-01-02', dueTime: '10:30' });
    const cleared = await updateReminder(item.id, { dueDate: null });
    expect(cleared.dueTime).toBeNull();
    const moved = await updateReminder(item.id, { listId: b.id });
    const peers = (await fetchReminders()).items.filter(i => i.listId === b.id && i.id !== item.id);
    expect(moved.order).toBeGreaterThan(Math.max(...peers.map(p => p.order)));
  });

  it('rejects a reorder with an id from another list or a duplicate, all or nothing', async () => {
    const snap = await fetchReminders();
    const [a, b] = snap.lists;
    const inA = snap.items.filter(i => i.listId === a.id).map(i => i.id);
    const inB = snap.items.find(i => i.listId === b.id)!.id;
    await expect(reorderReminders(a.id, [inA[0], inB])).rejects.toMatchObject({ code: 'stale' });
    await expect(reorderReminders(a.id, [inA[0], inA[0]])).rejects.toMatchObject({ code: 'stale' });
    await expect(reorderReminders(a.id, ['ghost'])).rejects.toMatchObject({ code: 'stale' });
    await expect(reorderReminders('no-list', [])).rejects.toMatchObject({ code: 'notFound' });
    if (inA.length > 1) await expect(reorderReminders(a.id, [inA[0]])).rejects.toMatchObject({ code: 'stale' });
    await expect(updateReminder(inA[0], { order: 1_000_001 })).rejects.toMatchObject({ code: 'invalid' });
    await reorderReminders(a.id, [...inA].reverse());
    const order = (await fetchReminders()).items.filter(i => i.listId === a.id).sort((x, y) => x.order - y.order).map(i => i.id);
    expect(order).toEqual([...inA].reverse());
  });

  it('answers every route with unavailable while the dev switch is on', async () => {
    const mock = await import('./remindersMock');
    mock.mockSetUnavailable(true);
    try {
      await expect(fetchReminders()).rejects.toMatchObject({ code: 'unavailable' });
      await expect(createReminderList({ name: 'x', color: '#112233', icon: 'list' })).rejects.toMatchObject({ code: 'unavailable' });
      await expect(clearCompletedReminders()).rejects.toMatchObject({ code: 'unavailable' });
    } finally {
      mock.mockSetUnavailable(false);
    }
    expect((await fetchReminders()).lists.length).toBeGreaterThan(0);
  });

  it('refuses to delete the last list', async () => {
    const created = await createReminderList({ name: 'Extra', color: '#112233', icon: 'list' });
    const { lists } = await fetchReminders();
    for (const l of lists.filter(x => x.id !== created.id)) await deleteReminderList(l.id);
    await expect(deleteReminderList(created.id)).rejects.toMatchObject({ code: 'lastList' });
  });
});
