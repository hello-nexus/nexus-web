import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { armSentry, registerPhonePush } from './sentry';
import { setActiveTransport } from './service';

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const STATE = { supported: true, armed: true, locked: true, alertPhones: 1, lastAlertAt: null, cooldownSeconds: 3600 };

beforeEach(() => {
  localStorage.setItem('nexus_token', 'test-token');
  setActiveTransport('lan');
});

afterEach(() => {
  vi.unstubAllGlobals();
  setActiveTransport(null);
});

describe('armSentry', () => {
  it('posts the lock flag and returns the state', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, STATE));
    vi.stubGlobal('fetch', fetchMock);
    const result = await armSentry(true);
    expect(result).toEqual({ ok: true, state: STATE });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/sentry/arm');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ lock: true });
  });

  it('maps a 409 not_locked body to the not_locked reason', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(409, { error: 'not_locked' })));
    expect(await armSentry(false)).toEqual({ ok: false, reason: 'not_locked' });
  });

  it('reports a 403 refusal as failed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(403, { error: 'forbidden' })));
    expect(await armSentry(true)).toEqual({ ok: false, reason: 'failed' });
  });

  it('reports any other failure as failed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(500, { error: 'boom' })));
    expect(await armSentry(false)).toEqual({ ok: false, reason: 'failed' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await armSentry(false)).toEqual({ ok: false, reason: 'failed' });
  });
});

describe('registerPhonePush', () => {
  it('PUTs the registration with the literal {pc} placeholder intact', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { error: false, msg: '' }));
    vi.stubGlobal('fetch', fetchMock);
    await registerPhonePush({
      platform: 'ios', token: 'abc', environment: 'production', title: 'Sentry', body: 'Someone is using {pc}',
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/panel/phone/push');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string).body).toBe('Someone is using {pc}');
  });
});
