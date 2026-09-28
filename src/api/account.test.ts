// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPublicAccount, openRecovery, verifyEmail } from './account';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('getPublicAccount', () => {
  it('resolves ok on a 2xx response', async () => {
    const account = { username: 'Nova', avatar: null, isPrivate: true };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, account)));

    const result = await getPublicAccount('nova');
    expect(result).toEqual({ status: 'ok', account });
  });

  it('resolves not-found on 404 without retrying', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(404, {}));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getPublicAccount('ghost');
    expect(result).toEqual({ status: 'not-found' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('resolves error on a non-transient 4xx without retrying', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(400, {}));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getPublicAccount('bad');
    expect(result).toEqual({ status: 'error' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a transient 5xx with backoff and succeeds', async () => {
    const account = { username: 'Nova', avatar: null, isPrivate: true };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(503, {}))
      .mockResolvedValueOnce(jsonResponse(200, account));
    vi.stubGlobal('fetch', fetchMock);

    const promise = getPublicAccount('nova');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ status: 'ok', account });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('resolves error after exhausting retries on repeated network failure', async () => {
    const fetchMock = vi.fn(async () => { throw new Error('network down'); });
    vi.stubGlobal('fetch', fetchMock);

    const promise = getPublicAccount('nova');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ status: 'error' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('stops retrying once the caller aborts', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async () => {
      controller.abort();
      throw new DOMException('aborted', 'AbortError');
    });
    vi.stubGlobal('fetch', fetchMock);

    const promise = getPublicAccount('nova', controller.signal);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ status: 'error' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('verifyEmail', () => {
  it('resolves ok on {ok: true}', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { ok: true })));
    expect(await verifyEmail('tok')).toEqual({ ok: true });
  });

  it('reports alreadyVerified on a re-clicked link', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { ok: true, alreadyVerified: true })));
    expect(await verifyEmail('tok')).toEqual({ ok: true, alreadyVerified: true });
  });

  it('degrades a malformed ok body to failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {})));
    expect(await verifyEmail('tok')).toEqual({ ok: false });
  });

  it('does not retry a definitive non-2xx HTTP response', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(500, {}));
    vi.stubGlobal('fetch', fetchMock);

    expect(await verifyEmail('tok')).toEqual({ ok: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a thrown network error and succeeds once the connection recovers', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const promise = verifyEmail('tok');
    await vi.runAllTimersAsync();
    expect(await promise).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('degrades to failure after exhausting network retries', async () => {
    const fetchMock = vi.fn(async () => { throw new Error('connection refused'); });
    vi.stubGlobal('fetch', fetchMock);

    const promise = verifyEmail('tok');
    await vi.runAllTimersAsync();
    expect(await promise).toEqual({ ok: false });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('openRecovery', () => {
  it('sends the web header and credentials so the api can read the recovery cookie', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { status: 'approved', username: 'Nova' }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await openRecovery('tok')).toEqual({ status: 'approved' });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.credentials).toBe('include');
    expect((init.headers as Record<string, string>)['X-Nexus-Auth']).toBe('web');
    expect(JSON.parse(String(init.body))).toEqual({ token: 'tok' });
  });

  it('hands back the code for another device', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { status: 'code', code: '482-915' })));
    expect(await openRecovery('tok')).toEqual({ status: 'code', code: '482-915' });
  });

  it('reports a 400 as a dead link and anything else as a retryable error, without retrying', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(400, { message: 'invalid or expired link' })));
    expect(await openRecovery('tok')).toEqual({ status: 'invalid' });

    const fetchMock = vi.fn(async () => jsonResponse(500, {}));
    vi.stubGlobal('fetch', fetchMock);
    expect(await openRecovery('tok')).toEqual({ status: 'error' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up on a request that never settles, rather than hanging the page', async () => {
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    vi.stubGlobal('fetch', fetchMock);

    const pending = openRecovery('tok');
    await vi.advanceTimersByTimeAsync(20_000);

    expect(await pending).toEqual({ status: 'error' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
