// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { completeRecovery, getPublicAccount, verifyEmail } from './account';

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

describe('completeRecovery', () => {
  it('resolves ok + username on {ok: true, username}', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { ok: true, username: 'Nova' })));
    expect(await completeRecovery('tok')).toEqual({ ok: true, username: 'Nova' });
  });

  it('resolves ok: false on the enumeration-resistant 200-shaped failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { ok: false })));
    expect(await completeRecovery('tok')).toEqual({ ok: false });
  });

  it('resolves ok: false on a non-2xx transport failure without retrying', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(500, {}));
    vi.stubGlobal('fetch', fetchMock);

    expect(await completeRecovery('tok')).toEqual({ ok: false, reason: 'invalid' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up on a request that never settles, rather than hanging the page', async () => {
    vi.useFakeTimers();
    try {
      // A fetch that never resolves and only rejects when the signal aborts,
      // which is the shape of the hang this deadline exists for.
      const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      }));
      vi.stubGlobal('fetch', fetchMock);

      const pending = completeRecovery('tok', 'ABCDEF');
      await vi.advanceTimersByTimeAsync(20_000);

      expect(await pending).toEqual({ ok: false, reason: 'invalid' });
      // One attempt, not three: retrying an aborted request re-hangs it.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports a code-required 400 as its own reason, not a dead link', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(400, { code: 'code_required' })));
    expect(await completeRecovery('tok')).toEqual({ ok: false, reason: 'code-required' });
  });

  it('carries the remaining attempts back from a wrong code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(400, { code: 'code_mismatch', attemptsLeft: 2 })),
    );
    expect(await completeRecovery('tok')).toEqual({
      ok: false,
      reason: 'code-mismatch',
      attemptsLeft: 2,
    });
  });

  it('sends the code only when one was supplied', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { ok: true, username: 'Nova' }));
    vi.stubGlobal('fetch', fetchMock);

    await completeRecovery('tok');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({ token: 'tok' });

    await completeRecovery('tok', 'ABCDEF');
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toEqual({
      token: 'tok',
      code: 'ABCDEF',
    });
  });
});
