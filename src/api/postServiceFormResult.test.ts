import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// postServiceFormResult tells a refused upload (the service answered with a
// non-2xx) from an unreachable one (no answer at all). postServiceForm folds
// both into null, which is why a per-file batch cannot be built on it.

vi.mock('./relayHttp', () => ({
  relayFetch: vi.fn(),
  resetRelayHttpTunnel: () => {},
}));

vi.mock('./auth', () => ({
  getToken: vi.fn(async () => 'session-token'),
  handleUnauthorized: vi.fn(async () => ''),
  hasSessionToken: vi.fn(() => true),
}));

import { postServiceForm, postServiceFormResult, setActiveTransport } from './service';

type Stage = { stageId: string; error: boolean; msg: string };

beforeEach(() => {
  setActiveTransport('lan');
});

afterEach(() => {
  vi.unstubAllGlobals();
  setActiveTransport(null);
});

describe('postServiceFormResult', () => {
  it('returns the accepted body as-is', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ stageId: 's1', error: false, msg: '' }), { status: 200 })));
    const out = await postServiceFormResult<Stage>('/x/stage', new FormData());
    expect(out).toEqual({ stageId: 's1', error: false, msg: '' });
  });

  it("carries a refusal's own message where postServiceForm returns null", async () => {
    const refused = () => new Response(JSON.stringify({ error: true, msg: 'Unsupported file format' }), { status: 400 });
    vi.stubGlobal('fetch', vi.fn(async () => refused()));
    expect(await postServiceFormResult<Stage>('/x/stage', new FormData())).toEqual({ error: true, msg: 'Unsupported file format' });
    expect(await postServiceForm<Stage>('/x/stage', new FormData())).toBeNull();
  });

  it('treats an accepted answer without a body as a refusal by status, never as unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    expect(await postServiceFormResult<Stage>('/x/stage', new FormData())).toEqual({ error: true, msg: 'HTTP 204' });
  });

  it('falls back to the status when a refusal has no readable message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>oops</html>', { status: 502 })));
    expect(await postServiceFormResult<Stage>('/x/stage', new FormData())).toEqual({ error: true, msg: 'HTTP 502' });
  });

  it('reports a problem body by its detail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ title: 'Error', detail: 'ffmpeg exited 1' }), { status: 500 })));
    expect(await postServiceFormResult<Stage>('/x/stage', new FormData())).toEqual({ error: true, msg: 'ffmpeg exited 1' });
  });

  it('is null only when the request never got an answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect(await postServiceFormResult<Stage>('/x/stage', new FormData())).toBeNull();
  });

  it('fails closed over a tunnel, where multipart cannot travel', async () => {
    const directFetch = vi.fn();
    vi.stubGlobal('fetch', directFetch);
    setActiveTransport('relay');
    expect(await postServiceFormResult<Stage>('/x/stage', new FormData())).toBeNull();
    expect(directFetch).not.toHaveBeenCalled();
  });
});
