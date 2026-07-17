import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAiStatus, postAiConfig, rotateAiToken } from './aiIntegration';
import { setActiveTransport } from './service';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const STATUS = {
  enabled: true,
  running: true,
  port: 9420,
  endpoint: 'http://127.0.0.1:9420/mcp',
  token: 'mcp-token-abc',
  lastError: null,
  capabilities: { telemetry: true, cooling: true, lighting: true, profiles: true, history: true },
};

beforeEach(() => {
  localStorage.setItem('nexus_token', 'test-token');
  setActiveTransport('lan');
});

afterEach(() => {
  vi.unstubAllGlobals();
  setActiveTransport(null);
});

describe('fetchAiStatus', () => {
  it('GETs /ai/status and resolves the typed payload', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, STATUS));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchAiStatus();

    expect(result).toEqual(STATUS);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/ai/status');
    expect(init.method).toBeUndefined();
  });

  it('resolves null when the service is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));

    expect(await fetchAiStatus()).toBeNull();
  });
});

describe('postAiConfig', () => {
  it('POSTs the patch body to /ai/config and resolves the fresh status', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, STATUS));
    vi.stubGlobal('fetch', fetchMock);

    const result = await postAiConfig({ enabled: true });

    expect(result).toEqual(STATUS);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/ai/config');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ enabled: true });
  });

  it('sends a capability subset without touching the others', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, STATUS));
    vi.stubGlobal('fetch', fetchMock);

    await postAiConfig({ capabilities: { cooling: false } });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ capabilities: { cooling: false } });
  });

  it('resolves null on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(500, { error: true, msg: 'server_error' })));

    expect(await postAiConfig({ enabled: false })).toBeNull();
  });
});

describe('rotateAiToken', () => {
  it('POSTs an empty body to /ai/token/rotate and resolves the fresh status', async () => {
    const rotated = { ...STATUS, token: 'mcp-token-new' };
    const fetchMock = vi.fn(async () => jsonResponse(200, rotated));
    vi.stubGlobal('fetch', fetchMock);

    const result = await rotateAiToken();

    expect(result).toEqual(rotated);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/ai/token/rotate');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({});
  });
});
