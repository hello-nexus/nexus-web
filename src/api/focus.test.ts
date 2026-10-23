import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchWithStatus = vi.fn();
vi.mock('./service', () => ({
  authFetchWithStatus: (...args: unknown[]) => fetchWithStatus(...args),
  deleteService: vi.fn(),
  fetchService: vi.fn(),
  postService: vi.fn(),
}));

import { updateFocusMode } from './focus';

const json = (status: number, body: unknown) => ({
  response: new Response(JSON.stringify(body), { status }),
  status,
});

describe('updateFocusMode', () => {
  beforeEach(() => fetchWithStatus.mockReset());

  it('returns the status on success', async () => {
    fetchWithStatus.mockResolvedValue(json(200, { modes: [] }));
    expect(await updateFocusMode('a', { name: 'x' })).toEqual({ ok: true, status: { modes: [] } });
  });

  it('parses the unresolved app names out of a 400', async () => {
    fetchWithStatus.mockResolvedValue(json(400, { error: true, msg: 'could not resolve: Discord, Slack' }));
    expect(await updateFocusMode('a', { apps: [] })).toEqual({ ok: false, unresolved: ['Discord', 'Slack'] });
  });

  it('treats a transport failure and other statuses as plain failures', async () => {
    fetchWithStatus.mockResolvedValue({ response: null, status: 0 });
    expect(await updateFocusMode('a', {})).toEqual({ ok: false, unresolved: null });
    fetchWithStatus.mockResolvedValue(json(400, { error: true, msg: 'name required' }));
    expect(await updateFocusMode('a', {})).toEqual({ ok: false, unresolved: null });
    fetchWithStatus.mockResolvedValue(json(500, {}));
    expect(await updateFocusMode('a', {})).toEqual({ ok: false, unresolved: null });
  });
});
