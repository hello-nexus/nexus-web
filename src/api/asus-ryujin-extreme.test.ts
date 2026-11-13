// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRyujinDisplay, setRyujinDisplay } from './asus-ryujin-extreme';

const fetchMock = vi.fn();

vi.mock('./service', async () => {
  const actual = await vi.importActual<typeof import('./service')>('./service');
  return {
    ...actual,
    fetchService: (path: string) => fetchMock('GET', path),
    putService: (path: string, body: unknown) => fetchMock('PUT', path, body),
  };
});

beforeEach(() => { fetchMock.mockReset(); });

describe('asus ryujin extreme api', () => {
  it('reads the display route', async () => {
    fetchMock.mockResolvedValue({ isConnected: true, brightness: 40, rotation: 90 });
    expect(await getRyujinDisplay()).toEqual({ isConnected: true, brightness: 40, rotation: 90 });
    expect(fetchMock).toHaveBeenCalledWith('GET', '/devices/asus-ryujin-extreme/display');
  });

  it('returns null for a failed or malformed read', async () => {
    fetchMock.mockResolvedValue(null);
    expect(await getRyujinDisplay()).toBeNull();
    fetchMock.mockResolvedValue({ error: true, msg: 'x' });
    expect(await getRyujinDisplay()).toBeNull();
  });

  it('puts the patch and maps the envelope to a boolean', async () => {
    fetchMock.mockResolvedValue({ error: false, msg: '' });
    expect(await setRyujinDisplay({ brightness: 35 })).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('PUT', '/devices/asus-ryujin-extreme/display', { brightness: 35 });
    fetchMock.mockResolvedValue({ error: true, msg: 'brightness must be 10 to 100' });
    expect(await setRyujinDisplay({ brightness: 5 })).toBe(false);
    fetchMock.mockResolvedValue(null);
    expect(await setRyujinDisplay({ rotation: 90 })).toBe(false);
  });
});
