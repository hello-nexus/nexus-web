import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRyujinDisplay, setRyujinDisplay } from './asus-ryujin-extreme';
import { setActiveTransport } from './service';

const fetchMock = vi.fn();

beforeEach(() => {
  localStorage.setItem('nexus_token', 'test-token');
  setActiveTransport('lan');
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  setActiveTransport(null);
});

const reply = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body } as unknown as Response);

describe('asus ryujin extreme api over fetch', () => {
  it('sends a PUT with the JSON patch and reads the envelope', async () => {
    fetchMock.mockImplementation(() => reply({ error: false, msg: '' }));
    expect(await setRyujinDisplay({ rotation: 90 })).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/devices/asus-ryujin-extreme/display');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({ rotation: 90 });
  });

  it('treats an error envelope as a refusal and a payload without brightness as null', async () => {
    fetchMock.mockImplementation(() => reply({ error: true, msg: 'rotation must be 0 or 90' }));
    expect(await setRyujinDisplay({ rotation: 90 })).toBe(false);
    expect(await getRyujinDisplay()).toBeNull();
  });
});
