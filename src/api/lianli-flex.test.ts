import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetch = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
vi.mock('./service', () => ({
  fetchService: (...args: unknown[]) => mockFetch(...args),
  postService: (...args: unknown[]) => mockPost(...args),
  putService: (...args: unknown[]) => mockPut(...args),
}));

import {
  getLianLiFlexState,
  identifyLianLiFlexFan,
  lianLiFlexLightingApi,
  lianLiFlexScreenApi,
  restartLianLiFlexLcd,
} from './lianli-flex';

beforeEach(() => {
  vi.clearAllMocks();
  mockPost.mockResolvedValue({ error: false, msg: '' });
  mockPut.mockResolvedValue({ error: false, msg: '' });
});

describe('lianli-flex api', () => {
  it('reads state and lighting from the wired routes', async () => {
    mockFetch.mockResolvedValue({ isConnected: true, fans: [] });
    await getLianLiFlexState();
    await lianLiFlexLightingApi.get();
    expect(mockFetch.mock.calls.map(c => c[0])).toEqual([
      '/devices/lianli-flex/state',
      '/devices/lianli-flex/lighting',
    ]);
  });

  it('puts a lighting patch, zones included, to the unit by MAC', async () => {
    const patch = { mode: 'perZone', zones: [{ id: 'up' as const, brightness: 2 }], upDownSwap: true, sortIndex: 1 };
    expect(await lianLiFlexLightingApi.set('AA BB', patch)).toBe(true);
    expect(mockPut).toHaveBeenCalledWith('/devices/lianli-flex/lighting/AA%20BB', patch);
  });

  it('reports a refused request as false', async () => {
    mockPut.mockResolvedValue({ error: true, msg: 'no' });
    mockPost.mockResolvedValue(null);
    expect(await lianLiFlexLightingApi.set('AA', { mode: 'custom' })).toBe(false);
    expect(await lianLiFlexLightingApi.reset?.('AA')).toBe(false);
  });

  it('posts reset, restart and identify with the MAC', async () => {
    await lianLiFlexLightingApi.reset?.('AA');
    await restartLianLiFlexLcd('BB');
    await identifyLianLiFlexFan('CC');
    expect(mockPost.mock.calls).toEqual([
      ['/devices/lianli-flex/reset-lighting', { mac: 'AA' }],
      ['/devices/lianli-flex/restart-lcd', { mac: 'BB' }],
      ['/devices/lianli-flex/identify', { mac: 'CC' }],
    ]);
  });

  it('sends brightness and rotation for a screen but never sleep-when-locked', async () => {
    await lianLiFlexScreenApi.setSettings('S1', { brightness: 40, rotation: 1, sleepWhenLocked: true });
    expect(mockPost).toHaveBeenCalledWith('/devices/lianli-flex/screen/settings', { serial: 'S1', brightness: 40, rotation: 1 });
    mockPost.mockClear();
    expect(await lianLiFlexScreenApi.setSettings('S1', { sleepWhenLocked: true })).toBe(true);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('lists screens, orders them and sets content on the wired routes', async () => {
    mockFetch.mockResolvedValue({ screens: [{ serial: 'S1' }] });
    expect(await lianLiFlexScreenApi.getScreens()).toEqual([{ serial: 'S1' }]);
    await lianLiFlexScreenApi.setOrder(['S2', 'S1']);
    await lianLiFlexScreenApi.setContent('S1', 'image', 'm1');
    expect(mockFetch).toHaveBeenCalledWith('/devices/lianli-flex/screens');
    expect(mockPost.mock.calls).toEqual([
      ['/devices/lianli-flex/screens/order', { serials: ['S2', 'S1'] }],
      ['/devices/lianli-flex/screen/content', { serial: 'S1', contentType: 'image', mediaId: 'm1' }],
    ]);
  });
});
