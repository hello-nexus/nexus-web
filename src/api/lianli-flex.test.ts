import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetch = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDelete = vi.fn();
const mockAuthFetch = vi.fn();
const mockPostForm = vi.fn();
vi.mock('./service', () => ({
  fetchService: (...args: unknown[]) => mockFetch(...args),
  postService: (...args: unknown[]) => mockPost(...args),
  putService: (...args: unknown[]) => mockPut(...args),
  deleteService: (...args: unknown[]) => mockDelete(...args),
  authFetchWithStatus: (...args: unknown[]) => mockAuthFetch(...args),
  postServiceFormResult: (...args: unknown[]) => mockPostForm(...args),
  resolveHttp: (path: string) => path,
}));

import {
  applyLianLiFlexTemplate,
  applyLianLiFlexToAll,
  captureLianLiFlexMedia,
  deleteLianLiFlexTemplate,
  exportLianLiFlexTemplate,
  getLianLiFlexFanProfile,
  getLianLiFlexState,
  getLianLiFlexSync,
  getLianLiFlexTemplates,
  getLianLiFlexThermalAlert,
  identifyLianLiFlexFan,
  importLianLiFlexTemplate,
  isForeignTemplateFile,
  lianLiFlexLightingApi,
  lianLiFlexScreenApi,
  restartLianLiFlexLcd,
  restoreLianLiFlexFanDefault,
  saveLianLiFlexTemplate,
  setLianLiFlexFanProfile,
  setLianLiFlexFanSync,
  setLianLiFlexSync,
  setLianLiFlexThermalAlert,
  syncLianLiFlexScreens,
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

  it('sends only the screen settings that changed, sleep-when-locked included', async () => {
    await lianLiFlexScreenApi.setSettings('S1', { brightness: 40, rotation: 1, sleepWhenLocked: true });
    expect(mockPost).toHaveBeenCalledWith('/devices/lianli-flex/screen/settings', { serial: 'S1', brightness: 40, rotation: 1, sleepWhenLocked: true });
    mockPost.mockClear();
    await lianLiFlexScreenApi.setSettings('S1', { sleepWhenLocked: false });
    expect(mockPost).toHaveBeenCalledWith('/devices/lianli-flex/screen/settings', { serial: 'S1', sleepWhenLocked: false });
    mockPost.mockClear();
    expect(await lianLiFlexScreenApi.setSettings('S1', {})).toBe(true);
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

describe('lianli-flex round 2 api', () => {
  it('reads and patches the fan profile of one unit', async () => {
    mockFetch.mockResolvedValue({ mac: 'AA 11', profile: 'quiet' });
    expect(await getLianLiFlexFanProfile('AA 11')).toEqual({ mac: 'AA 11', profile: 'quiet' });
    expect(mockFetch).toHaveBeenCalledWith('/devices/lianli-flex/fan/AA%2011');
    expect(await setLianLiFlexFanProfile('AA', { profile: 'fixed', fixedPercent: 40 })).toBe(true);
    expect(mockPut).toHaveBeenCalledWith('/devices/lianli-flex/fan/AA', { profile: 'fixed', fixedPercent: 40 });
    await restoreLianLiFlexFanDefault('AA');
    expect(mockPost).toHaveBeenCalledWith('/devices/lianli-flex/fan/AA/default', {});
    await setLianLiFlexFanSync(true);
    expect(mockPut).toHaveBeenCalledWith('/devices/lianli-flex/fan-sync', { enabled: true });
  });

  it('reads and patches the sync group and the thermal alert', async () => {
    mockFetch.mockResolvedValue({});
    await getLianLiFlexSync();
    await getLianLiFlexThermalAlert();
    expect(mockFetch.mock.calls.map(c => c[0])).toEqual(['/devices/lianli-flex/sync', '/devices/lianli-flex/thermal-alert']);
    const sync = { enabled: true, members: [{ mac: 'AA', sliceDirection: 1 }] };
    expect(await setLianLiFlexSync(sync)).toBe(true);
    expect(mockPut).toHaveBeenCalledWith('/devices/lianli-flex/sync', sync);
    expect(await setLianLiFlexThermalAlert({ cpu: { threshold: 90 } })).toBe(true);
    expect(mockPut).toHaveBeenCalledWith('/devices/lianli-flex/thermal-alert', { cpu: { threshold: 90 } });
  });

  it('applies to all and returns what was applied and skipped', async () => {
    mockPost.mockResolvedValue({ error: false, msg: '', applied: ['BB'], skipped: ['CC'] });
    expect(await applyLianLiFlexToAll('AA', ['fan'], 'all')).toEqual({ ok: true, applied: ['BB'], skipped: ['CC'] });
    expect(mockPost).toHaveBeenCalledWith('/devices/lianli-flex/apply-all', { mac: 'AA', what: ['fan'], scope: 'all' });
    mockPost.mockResolvedValue(null);
    expect(await applyLianLiFlexToAll('AA', ['lighting'], 'family')).toEqual({ ok: false, applied: [], skipped: [] });
  });

  it('syncs screens from one serial', async () => {
    expect(await syncLianLiFlexScreens('S1')).toBe(true);
    expect(mockPost).toHaveBeenCalledWith('/devices/lianli-flex/screens/sync', { serial: 'S1' });
  });

  it('captures into the media library and returns null when refused', async () => {
    mockPost.mockResolvedValue({ error: false, msg: '', mediaId: 'm9', name: 'cap', kind: 'video' });
    expect(await captureLianLiFlexMedia({ durationSeconds: 5 })).toMatchObject({ id: 'm9', kind: 'video' });
    expect(mockPost).toHaveBeenCalledWith('/devices/lianli-flex/media/capture', { durationSeconds: 5 });
    mockPost.mockResolvedValue({ error: true, msg: 'no' });
    expect(await captureLianLiFlexMedia({})).toBeNull();
  });

  it('lists, saves, applies and deletes templates', async () => {
    mockFetch.mockResolvedValue({ templates: [{ id: 't1', name: 'A', family: 'tlFlex', createdUnixMs: 1 }] });
    expect(await getLianLiFlexTemplates()).toHaveLength(1);
    mockFetch.mockResolvedValue(null);
    expect(await getLianLiFlexTemplates()).toBeNull();
    await saveLianLiFlexTemplate('Mine', 'S1');
    await applyLianLiFlexTemplate('t 1', ['S1', 'S2']);
    await deleteLianLiFlexTemplate('t 1');
    expect(mockPost.mock.calls).toEqual([
      ['/devices/lianli-flex/templates', { name: 'Mine', serial: 'S1' }],
      ['/devices/lianli-flex/templates/t%201/apply', { serials: ['S1', 'S2'] }],
    ]);
    expect(mockDelete).toHaveBeenCalledWith('/devices/lianli-flex/templates/t%201');
  });

  it('exports a template as a blob, or null on failure', async () => {
    const blob = new Blob(['zip']);
    mockAuthFetch.mockResolvedValue({ response: { ok: true, blob: () => Promise.resolve(blob) }, status: 200 });
    expect(await exportLianLiFlexTemplate('t1')).toBe(blob);
    expect(mockAuthFetch).toHaveBeenCalledWith('/devices/lianli-flex/templates/t1/export');
    mockAuthFetch.mockResolvedValue({ response: { ok: false }, status: 500 });
    expect(await exportLianLiFlexTemplate('t1')).toBeNull();
  });

  it('imports a template file and passes the refusal message through', async () => {
    const file = new File(['x'], 'look.zip', { type: 'application/zip' });
    mockPostForm.mockResolvedValue({ error: false, msg: '' });
    expect(await importLianLiFlexTemplate(file)).toEqual({ ok: true });
    expect(mockPostForm.mock.calls[0][0]).toBe('/devices/lianli-flex/templates/import');
    mockPostForm.mockResolvedValue({ error: true, msg: 'Not a Nexus template' });
    expect(await importLianLiFlexTemplate(file)).toEqual({ ok: false, msg: 'Not a Nexus template' });
    mockPostForm.mockResolvedValue(null);
    expect(await importLianLiFlexTemplate(file)).toEqual({ ok: false, msg: '' });
  });

  it('recognizes other apps template files by extension', () => {
    expect(isForeignTemplateFile('Look.TEMPLATE')).toBe(true);
    expect(isForeignTemplateFile('a.theme')).toBe(true);
    expect(isForeignTemplateFile('a.modular')).toBe(true);
    expect(isForeignTemplateFile('look.zip')).toBe(false);
  });
});
