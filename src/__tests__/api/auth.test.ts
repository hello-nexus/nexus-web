import { describe, it, expect, vi, beforeEach } from 'vitest';

// Reset module state between tests by re-importing
let getToken: typeof import('../../api/auth').getToken;
let handleUnauthorized: typeof import('../../api/auth').handleUnauthorized;
let clearToken: typeof import('../../api/auth').clearToken;

beforeEach(async () => {
  vi.restoreAllMocks();
  localStorage.clear();
  // Re-import to reset module-level cached/pairingPromise
  vi.resetModules();
  const mod = await import('../../api/auth');
  getToken = mod.getToken;
  handleUnauthorized = mod.handleUnauthorized;
  clearToken = mod.clearToken;
});

function mockPairResponse(token: string) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ token }), { status: 200 })
  );
}

function mockPairFailure() {
  return vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
}

describe('getToken', () => {
  it('pairs on first call and caches the token', async () => {
    const spy = mockPairResponse('abc123');
    const t1 = await getToken();
    const t2 = await getToken();
    expect(t1).toBe('abc123');
    expect(t2).toBe('abc123');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('reads token from localStorage if present', async () => {
    localStorage.setItem('nexus_token', 'stored-token');
    const spy = mockPairResponse('new-token');
    const token = await getToken();
    expect(token).toBe('stored-token');
    expect(spy).not.toHaveBeenCalled();
  });

  it('persists token to localStorage after pairing', async () => {
    mockPairResponse('persist-me');
    await getToken();
    expect(localStorage.getItem('nexus_token')).toBe('persist-me');
  });

  it('returns empty string on network failure', async () => {
    mockPairFailure();
    const token = await getToken();
    expect(token).toBe('');
  });

  it('deduplicates concurrent pair calls', async () => {
    const spy = mockPairResponse('dedup-token');
    const [t1, t2, t3] = await Promise.all([getToken(), getToken(), getToken()]);
    expect(t1).toBe('dedup-token');
    expect(t2).toBe('dedup-token');
    expect(t3).toBe('dedup-token');
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('handleUnauthorized', () => {
  it('clears cached token and re-pairs', async () => {
    mockPairResponse('old-token');
    await getToken();
    expect(localStorage.getItem('nexus_token')).toBe('old-token');

    vi.restoreAllMocks();
    mockPairResponse('new-token');
    const token = await handleUnauthorized();
    expect(token).toBe('new-token');
    expect(localStorage.getItem('nexus_token')).toBe('new-token');
  });
});

describe('clearToken', () => {
  it('removes token from localStorage and cache', async () => {
    mockPairResponse('to-clear');
    await getToken();
    clearToken();
    expect(localStorage.getItem('nexus_token')).toBeNull();
  });
});
