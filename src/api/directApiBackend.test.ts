import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthBackend } from './authBackend';

const BASE = 'http://localhost:3000';
const REFRESH_KEY = 'nexus_direct_refresh_token';
const RECOVERY_GRANT_KEY = 'nexus_direct_recovery_grant';

function mkApiAccount(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'acct-1',
    email: 'alpha@example.com',
    emailVerified: true,
    username: 'alpha',
    isPrivate: false,
    avatar: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function emptyResponse(status: number): Response {
  return new Response(null, { status });
}

// Each test gets a fresh module instance so the closure-held in-memory
// access token / cached account never leaks between cases - only
// localStorage/sessionStorage (cleared in beforeEach) simulate persistence.
async function freshBackend(): Promise<AuthBackend> {
  vi.resetModules();
  const mod = await import('./directApiBackend');
  return mod.directApiBackend;
}

describe('directApiBackend', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('login', () => {
    it('persists the refresh token and maps the account into the envelope body', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, {
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        account: mkApiAccount(),
      }));
      const backend = await freshBackend();

      const result = await backend.login('alpha', 'hunter22');

      expect(result.status).toBe(200);
      expect(result.body).toMatchObject({ error: false, accountId: 'acct-1', username: 'alpha' });
      expect(localStorage.getItem(REFRESH_KEY)).toBe('refresh-1');
      expect(fetchMock).toHaveBeenCalledWith(`${BASE}/auth/login`, expect.objectContaining({ method: 'POST' }));
    });

    it('maps a {code,message} error body to the {error,msg} envelope, same as the local service', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(401, { code: 'invalid_credentials', message: 'invalid credentials' }));
      const backend = await freshBackend();

      const result = await backend.login('alpha', 'wrong');

      expect(result.status).toBe(401);
      expect(result.body).toEqual({ error: true, msg: 'invalid_credentials' });
    });

    it('falls back to the raw message when the server sends no code (e.g. a plain-string exception)', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(403, { message: 'email not verified' }));
      const backend = await freshBackend();

      const result = await backend.login('alpha', 'hunter22');

      expect(result.body).toEqual({ error: true, msg: 'email not verified' });
    });

    it('a network failure resolves to status 0 with a null body, never throwing', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      const backend = await freshBackend();

      const result = await backend.login('alpha', 'hunter22');

      expect(result).toEqual({ status: 0, body: null });
    });
  });

  describe('register', () => {
    it('reports 409 username_taken from the code field', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(409, { code: 'username_taken', message: 'username already in use' }));
      const backend = await freshBackend();

      const result = await backend.register('a@b.com', 'Hunter22', 'alpha');

      expect(result.status).toBe(409);
      expect(result.body).toEqual({ error: true, msg: 'username_taken' });
    });
  });

  describe('authenticated calls: 401-retry-once', () => {
    it('retries exactly once after a 401 using a freshly refreshed token, then succeeds', async () => {
      localStorage.setItem(REFRESH_KEY, 'refresh-0');
      const backend = await freshBackend();

      // 1: login seeds an in-memory access token.
      fetchMock.mockResolvedValueOnce(jsonResponse(200, {
        accessToken: 'access-stale', refreshToken: 'refresh-1', account: mkApiAccount(),
      }));
      await backend.login('alpha', 'hunter22');

      // 2: changeUsername's first attempt (access-stale) is rejected.
      // 3: the resulting refresh rotates to access-fresh/refresh-2.
      // 4: changeUsername's retry (access-fresh) succeeds.
      fetchMock
        .mockResolvedValueOnce(jsonResponse(401, { message: 'jwt expired' }))
        .mockResolvedValueOnce(jsonResponse(200, {
          accessToken: 'access-fresh', refreshToken: 'refresh-2', account: mkApiAccount(),
        }))
        .mockResolvedValueOnce(jsonResponse(200, mkApiAccount({ username: 'newname' })));

      const result = await backend.changeUsername('newname');

      expect(result.status).toBe(200);
      expect(fetchMock).toHaveBeenNthCalledWith(2, `${BASE}/account/username`, expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer access-stale' }),
      }));
      expect(fetchMock).toHaveBeenNthCalledWith(3, `${BASE}/auth/refresh`, expect.anything());
      expect(fetchMock).toHaveBeenNthCalledWith(4, `${BASE}/account/username`, expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer access-fresh' }),
      }));
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it('short-circuits with no network call when there is no refresh token to authenticate with', async () => {
      const backend = await freshBackend();

      const account = await backend.getAccount();

      expect(account).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('refresh rotation persistence', () => {
    it('persists the rotated refresh token before the access token is ever used, surviving a fresh module reload', async () => {
      localStorage.setItem(REFRESH_KEY, 'refresh-0');
      const first = await freshBackend();
      // getAccount() on a cold module costs two calls: the silent refresh,
      // then the authenticated GET.
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, {
          accessToken: 'access-1', refreshToken: 'refresh-1', account: mkApiAccount(),
        }))
        .mockResolvedValueOnce(jsonResponse(200, mkApiAccount()));
      await first.getAccount();
      expect(localStorage.getItem(REFRESH_KEY)).toBe('refresh-1');

      // A fresh module instance (simulating a page reload - the in-memory
      // access token is gone, only localStorage survives) must authenticate
      // with the ROTATED token, proving it was durably written before the
      // first instance's call ever returned.
      const second = await freshBackend();
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, {
          accessToken: 'access-2', refreshToken: 'refresh-2', account: mkApiAccount(),
        }))
        .mockResolvedValueOnce(jsonResponse(200, mkApiAccount()));
      await second.getAccount();

      expect(fetchMock).toHaveBeenNthCalledWith(3, `${BASE}/auth/refresh`, expect.objectContaining({
        body: JSON.stringify({ refreshToken: 'refresh-1' }),
      }));
    });

    it('clears the stored session when the refresh token is definitively rejected (401/403)', async () => {
      localStorage.setItem(REFRESH_KEY, 'refresh-dead');
      fetchMock.mockResolvedValueOnce(jsonResponse(401, { message: 'refresh token reuse detected' }));
      const backend = await freshBackend();

      const account = await backend.getAccount();

      expect(account).toBeNull();
      expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
    });
  });

  describe('logout', () => {
    it('posts the stored refresh token and clears local session state regardless of the response', async () => {
      localStorage.setItem(REFRESH_KEY, 'refresh-1');
      fetchMock.mockResolvedValueOnce(emptyResponse(204));
      const backend = await freshBackend();

      await backend.logout();

      expect(fetchMock).toHaveBeenCalledWith(`${BASE}/auth/logout`, expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ refreshToken: 'refresh-1' }),
      }));
      expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
    });
  });

  describe('recovery device-grant flow', () => {
    it('recoveryStart generates a grantId+deviceSecret, stores them in sessionStorage, and never puts them in localStorage', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
      const backend = await freshBackend();

      const result = await backend.recoveryStart('alpha@example.com');

      expect(result?.grantId).toBe('11111111-1111-4111-8111-111111111111');
      expect(sessionStorage.getItem(RECOVERY_GRANT_KEY)).toContain(result!.grantId);
      expect(localStorage.getItem(RECOVERY_GRANT_KEY)).toBeNull();
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as { deviceSecret: string };
      expect(body.deviceSecret).toHaveLength(32);
    });

    it('recoveryStatus with no grant in sessionStorage returns null without a network call', async () => {
      const backend = await freshBackend();

      const status = await backend.recoveryStatus();

      expect(status).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('an approved poll applies the session and clears the grant', async () => {
      sessionStorage.setItem(RECOVERY_GRANT_KEY, JSON.stringify({ grantId: 'g1', deviceSecret: 'x'.repeat(32) }));
      fetchMock.mockResolvedValueOnce(jsonResponse(200, {
        status: 'approved', accessToken: 'access-1', refreshToken: 'refresh-1', account: mkApiAccount(),
      }));
      const backend = await freshBackend();

      const status = await backend.recoveryStatus();

      expect(status).toEqual({ status: 'approved' });
      expect(sessionStorage.getItem(RECOVERY_GRANT_KEY)).toBeNull();
      expect(localStorage.getItem(REFRESH_KEY)).toBe('refresh-1');
    });

    it('a pending poll leaves the grant in place for the next tick', async () => {
      sessionStorage.setItem(RECOVERY_GRANT_KEY, JSON.stringify({ grantId: 'g1', deviceSecret: 'x'.repeat(32) }));
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { status: 'pending' }));
      const backend = await freshBackend();

      const status = await backend.recoveryStatus();

      expect(status).toEqual({ status: 'pending' });
      expect(sessionStorage.getItem(RECOVERY_GRANT_KEY)).not.toBeNull();
    });
  });

  describe('avatar upload', () => {
    it('uploads with multipart field name "file"', async () => {
      const backend = await freshBackend();
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, {
          accessToken: 'access-1', refreshToken: 'refresh-1', account: mkApiAccount(),
        }))
        .mockResolvedValueOnce(jsonResponse(200, { large: 'https://cdn/large.webp', small: 'https://cdn/small.webp' }));
      await backend.login('alpha', 'hunter22');

      const avatar = await backend.uploadAvatar(new Blob(['x'], { type: 'image/png' }));

      expect(avatar).toEqual({ large: 'https://cdn/large.webp', small: 'https://cdn/small.webp' });
      const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
      const form = init.body as FormData;
      expect(form.get('file')).toBeInstanceOf(Blob);
      expect(form.has('file')).toBe(true);
    });
  });

  describe('deleteAccount', () => {
    it('clears the local session on success', async () => {
      const backend = await freshBackend();
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, {
          accessToken: 'access-1', refreshToken: 'refresh-1', account: mkApiAccount(),
        }))
        .mockResolvedValueOnce(emptyResponse(204));
      await backend.login('alpha', 'hunter22');

      const result = await backend.deleteAccount('hunter22');

      expect(result.status).toBe(204);
      expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
    });

    it('does not clear the session on a wrong-password failure', async () => {
      const backend = await freshBackend();
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, {
          accessToken: 'access-1', refreshToken: 'refresh-1', account: mkApiAccount(),
        }))
        .mockResolvedValueOnce(jsonResponse(401, { message: 'current password is incorrect' }));
      await backend.login('alpha', 'hunter22');

      const result = await backend.deleteAccount('wrong');

      expect(result.status).toBe(401);
      expect(result.body).toEqual({ error: true, msg: 'current password is incorrect' });
      expect(localStorage.getItem(REFRESH_KEY)).toBe('refresh-1');
    });
  });
});
