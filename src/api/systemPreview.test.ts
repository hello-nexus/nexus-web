import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ authFetchWithStatus: vi.fn(), fetchService: vi.fn(), putServiceBytes: vi.fn() }));
vi.mock('./service', () => h);

import { fetchSystemCaseId, fetchSystemPreview, putSystemPreview } from './systemPreview';

const reply = (status: number, init: { blob?: () => Promise<Blob>; etag?: string } = {}) => ({
  status,
  response: {
    ok: status >= 200 && status < 300,
    blob: init.blob ?? (async () => new Blob(['png'])),
    headers: new Headers(init.etag ? { ETag: init.etag } : {}),
  },
});

describe('systemPreview api', () => {
  beforeEach(() => Object.values(h).forEach(f => f.mockReset()));

  it('maps the preview statuses and sends the ETag back', async () => {
    h.authFetchWithStatus.mockResolvedValueOnce(reply(200, { etag: '"a"' }));
    expect(await fetchSystemPreview('"old"')).toMatchObject({ kind: 'image', etag: '"a"' });
    expect(h.authFetchWithStatus).toHaveBeenCalledWith('/system/preview', { cache: 'no-store', headers: { 'If-None-Match': '"old"' } });
    h.authFetchWithStatus.mockResolvedValueOnce({ status: 304, response: null });
    expect(await fetchSystemPreview('"a"')).toEqual({ kind: 'unchanged' });
    h.authFetchWithStatus.mockResolvedValueOnce({ status: 404, response: null });
    expect(await fetchSystemPreview()).toEqual({ kind: 'none' });
    h.authFetchWithStatus.mockResolvedValueOnce({ status: 0, response: null });
    expect(await fetchSystemPreview()).toEqual({ kind: 'error' });
  });

  it('turns a rejecting body read or request into an error result', async () => {
    h.authFetchWithStatus.mockResolvedValueOnce(reply(200, { blob: async () => { throw new Error('x'); } }));
    expect(await fetchSystemPreview()).toEqual({ kind: 'error' });
    h.authFetchWithStatus.mockRejectedValueOnce(new Error('x'));
    expect(await fetchSystemPreview()).toEqual({ kind: 'error' });
  });

  it('reads the case id and swallows a failed read', async () => {
    h.fetchService.mockResolvedValueOnce({ caseId: 'c1' });
    expect(await fetchSystemCaseId()).toBe('c1');
    h.fetchService.mockRejectedValueOnce(new Error('x'));
    expect(await fetchSystemCaseId()).toBeNull();
  });

  it('PUTs the png bytes for the case', async () => {
    h.putServiceBytes.mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await putSystemPreview('a b', new Uint8Array([1, 2]).buffer)).toBe(true);
    expect(h.putServiceBytes).toHaveBeenCalledWith('/system/preview?caseId=a%20b', new Uint8Array([1, 2]), 'image/png');
    h.putServiceBytes.mockResolvedValueOnce(null);
    expect(await putSystemPreview('c', new ArrayBuffer(1))).toBe(false);
  });
});
