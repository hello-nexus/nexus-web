// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://localhost:9400/"}
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./auth', async importOriginal => ({
  ...(await importOriginal<typeof import('./auth')>()),
  getToken: vi.fn(async () => null),
  handleUnauthorized: vi.fn(async () => null),
}));

import { requestServiceRestart } from './lighting';

beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
afterEach(() => vi.unstubAllGlobals());

const respond = (status: number, body: unknown) =>
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe('requestServiceRestart', () => {
  it('is accepted on a 2xx and posts the reopen route', async () => {
    respond(200, { error: false, msg: '' });
    expect(await requestServiceRestart('/system/lighting')).toBe('accepted');
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/service/restart');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"reopenRoute":"/system/lighting"}');
  });

  it('is refused on a 400 with an error envelope', async () => {
    respond(400, { error: true, msg: 'invalid route' });
    expect(await requestServiceRestart('/nope')).toBe('refused');
  });

  it('is refused on a 409 already-restarting answer', async () => {
    respond(409, { error: true, msg: 'A reset or restart is already in progress.' });
    expect(await requestServiceRestart()).toBe('refused');
  });

  it('is dropped on a network error', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await requestServiceRestart()).toBe('dropped');
  });
});
