// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addCalendarSource, CalendarRequestError, fetchCalendarEvents, fetchCalendarSettings, fetchCalendarSources,
  postCalendarRefresh, probeCalendar, putCalendarRefreshMinutes, removeCalendarSource,
} from './calendar';

const service = vi.hoisted(() => ({ authFetchWithStatus: vi.fn() }));
vi.mock('./service', () => service);

const json = (body: unknown, status = 200) => ({ response: new Response(JSON.stringify(body), { status }), status });
const noRoute = () => ({ response: new Response('', { status: 404 }), status: 404 });

beforeEach(() => service.authFetchWithStatus.mockReset());

describe('calendar api client', () => {
  it('reads sources, settings and events from the service routes', async () => {
    service.authFetchWithStatus
      .mockResolvedValueOnce(json({ calendars: [{ id: 'a' }] }))
      .mockResolvedValueOnce(json({ refreshMinutes: 30, lastSyncedAt: null, syncing: false }))
      .mockResolvedValueOnce(json({ events: [], syncedAt: 7 }));
    expect(await fetchCalendarSources()).toEqual([{ id: 'a' }]);
    expect((await fetchCalendarSettings()).refreshMinutes).toBe(30);
    expect((await fetchCalendarEvents(10.4, 20.6)).syncedAt).toBe(7);
    expect(service.authFetchWithStatus.mock.calls.map(c => c[0])).toEqual([
      '/api/calendar/calendars', '/api/calendar/settings', '/api/calendar/events?from=10&to=21',
    ]);
  });

  it('falls back to the dev fixtures when the service has no calendar routes', async () => {
    service.authFetchWithStatus.mockResolvedValue(noRoute());
    const sources = await fetchCalendarSources();
    expect(sources.length).toBeGreaterThan(0);
    const now = Date.now();
    const result = await fetchCalendarEvents(now - 86_400_000, now + 86_400_000);
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.events.every(e => sources.some(s => s.id === e.calendarId))).toBe(true);
  });

  it('does not mask a server error as a missing route', async () => {
    service.authFetchWithStatus.mockResolvedValue({ response: new Response('', { status: 500 }), status: 500 });
    await expect(fetchCalendarSources()).rejects.toThrow('500');
  });

  it('sends the refresh interval and the manual refresh', async () => {
    service.authFetchWithStatus.mockResolvedValueOnce(json({ refreshMinutes: 5, lastSyncedAt: null, syncing: false }));
    expect((await putCalendarRefreshMinutes(5)).refreshMinutes).toBe(5);
    expect(service.authFetchWithStatus).toHaveBeenLastCalledWith('/api/calendar/settings', { method: 'PUT', body: { refreshMinutes: 5 } });
    service.authFetchWithStatus.mockResolvedValueOnce(json({ started: true }, 202));
    await postCalendarRefresh();
    expect(service.authFetchWithStatus).toHaveBeenLastCalledWith('/api/calendar/refresh', { method: 'POST' });
  });

  it('returns the added source and reads a refusal code from a 400', async () => {
    service.authFetchWithStatus.mockResolvedValueOnce(json({ id: 'n', name: 'N' }, 201));
    expect((await addCalendarSource({ url: 'https://x.test/a.ics', name: 'N', color: '#fff' })).id).toBe('n');
    service.authFetchWithStatus.mockResolvedValueOnce(json({ error: 'tooLarge' }, 400));
    const failure = await addCalendarSource({ url: 'https://x.test/a.ics', name: 'N', color: '#fff' }).catch(e => e);
    expect(failure).toBeInstanceOf(CalendarRequestError);
    expect(failure.code).toBe('tooLarge');
  });

  it('reads the invalidUrl refusal', async () => {
    service.authFetchWithStatus.mockResolvedValueOnce(json({ error: 'invalidUrl', msg: 'invalidUrl' }, 400));
    const failure = await addCalendarSource({ url: 'http://192.168.1.5/a.ics', name: 'N', color: '#fff' }).catch(e => e);
    expect(failure.code).toBe('invalidUrl');
  });

  it('reads the duplicate refusal', async () => {
    service.authFetchWithStatus.mockResolvedValueOnce(json({ error: 'duplicate', msg: 'duplicate' }, 400));
    const failure = await addCalendarSource({ url: 'https://x.test/a.ics', name: 'N', color: '#fff' }).catch(e => e);
    expect(failure).toBeInstanceOf(CalendarRequestError);
    expect(failure.code).toBe('duplicate');
  });

  it('refuses a repeat address in the dev mock, however it is spelled', async () => {
    service.authFetchWithStatus.mockResolvedValue(noRoute());
    const first = await addCalendarSource({ url: 'https://dup.test/a.ics', name: 'A', color: '#fff' });
    expect(first.host).toBe('dup.test');
    for (const again of ['webcal://dup.test/a.ics', 'HTTPS://DUP.test:443/a.ics/']) {
      const failure = await addCalendarSource({ url: again, name: 'B', color: '#fff' }).catch(e => e);
      expect(failure.code).toBe('duplicate');
    }
    const wrongPort = await addCalendarSource({ url: 'https://dup.test:80/a.ics', name: 'D', color: '#fff' });
    expect(wrongPort.host).toBe('dup.test');
    const other = await addCalendarSource({ url: 'https://dup.test/a.ics?x=1', name: 'C', color: '#fff' });
    expect(other.host).toBe('dup.test');
  });

  it('keeps an unrecognized refusal as a generic failure', async () => {
    service.authFetchWithStatus.mockResolvedValueOnce(json({ error: true, msg: 'nope' }, 400));
    const failure = await addCalendarSource({ url: 'x', name: 'N', color: '#fff' }).catch(e => e);
    expect(failure).toBeInstanceOf(CalendarRequestError);
    expect(failure.code).toBeNull();
  });

  it('probes a feed for its name, maps a refusal, and falls back to a plausible dev name on a missing route', async () => {
    service.authFetchWithStatus.mockResolvedValueOnce(json({ name: 'Team', host: 'x.test' }));
    expect(await probeCalendar('https://x.test/a.ics')).toEqual({ name: 'Team', host: 'x.test' });
    service.authFetchWithStatus.mockResolvedValueOnce(json({ error: 'invalidUrl', msg: 'invalidUrl' }, 400));
    const refused = await probeCalendar('http://10.0.0.1/a.ics').catch(e => e);
    expect(refused).toBeInstanceOf(CalendarRequestError);
    expect(refused.code).toBe('invalidUrl');
    service.authFetchWithStatus.mockResolvedValueOnce(noRoute());
    expect(await probeCalendar('https://x.test/team-holidays.ics')).toEqual({ name: 'Team Holidays', host: 'x.test' });
  });

  it('accepts a bare 204 on delete and encodes the id', async () => {
    service.authFetchWithStatus.mockResolvedValueOnce({ response: new Response(null, { status: 204 }), status: 204 });
    await removeCalendarSource('a/b');
    expect(service.authFetchWithStatus).toHaveBeenLastCalledWith('/api/calendar/calendars/a%2Fb', { method: 'DELETE' });
  });
});
