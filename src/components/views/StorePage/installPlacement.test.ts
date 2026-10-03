import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Boxes } from 'lucide-react';
import type { AppMetadata } from '../../../panel/widgets/types';
import type { PanelLayout, PanelWidget } from '../../../panel/types';
import type { UnifiedDevice } from '../../../hooks/useUnifiedDevices';
import type { PanelDeviceRecord } from '../../../api/panel';
import {
  DASHBOARD_TARGET_KEY, commitPlacement, planPlacement, placementTargets, type PlacementTarget,
} from './installPlacement';

const fetchPreferences = vi.fn();
const savePreferences = vi.fn();
const fetchPanelDevice = vi.fn();
const fetchPanelDevices = vi.fn();
const patchPanelDevice = vi.fn();
const allocatePanelDevice = vi.fn();
const broadcastLayoutChanged = vi.fn();

vi.mock('../../../api/profiles', () => ({
  fetchPreferences: () => fetchPreferences(),
  savePreferences: (patch: unknown) => savePreferences(patch),
}));
vi.mock('../../../api/panel', () => ({
  fetchPanelDevice: (id: string) => fetchPanelDevice(id),
  fetchPanelDevices: () => fetchPanelDevices(),
  patchPanelDevice: (id: string, patch: unknown) => patchPanelDevice(id, patch),
  allocatePanelDevice: (...args: unknown[]) => allocatePanelDevice(...args),
}));
vi.mock('../../../panel/engine/panelSync', () => ({
  broadcastLayoutChanged: () => broadcastLayoutChanged(),
}));


const TYPE = 'app:com.example.fish';

const meta: AppMetadata = {
  type: TYPE,
  i18nKey: 'Fish',
  icon: Boxes,
  sizes: ['2x2', '4x2', '2x4', '4x4', '2x2round'],
  defaultSize: '4x2',
  supportsImmersive: { portrait: true, landscape: true },
  singleInstance: true,
  hasConfig: true,
  touch: false,
};

function layoutOf(surface: PanelLayout['surface'], widgets: Omit<PanelWidget, 'id'>[]): PanelLayout {
  return {
    layoutSchemaVersion: 1,
    surface,
    pages: [{ id: 'p0', widgets: widgets.map((w, i) => ({ ...w, id: `w${i}` })) }],
  };
}

const dashboard: PlacementTarget = { key: DASHBOARD_TARGET_KEY, name: 'Apps dashboard', iconSrc: null, surface: 'desktop' };
const q60: PlacementTarget = { key: 'panel-q60', name: 'Q60', iconSrc: '/q60.svg', surface: 'q60' };
const y70: PlacementTarget = {
  key: 'panel-y70', name: 'Y70', iconSrc: '/y70.svg', surface: 'y70', screen: { width: 682, height: 2560 }, screenDpi: 337,
};

describe('planPlacement', () => {
  it('puts the dashboard widget in the first free spot inside the visible columns', () => {
    const layout = layoutOf('desktop', [
      { type: 'monitoring', size: '4x2', col: 0, row: 0 },
      { type: 'weather', size: '2x2', col: 4, row: 0 },
    ]);

    const plan = planPlacement(dashboard, { layout }, TYPE, meta, 6);

    expect(plan?.widget).toMatchObject({ type: TYPE, size: '4x2', col: 0, row: 2 });
    expect(plan?.layout.pages).toHaveLength(1);
  });

  it('grows a full dashboard downward rather than refusing', () => {
    const rows = Array.from({ length: 4 }, (_, r) => ({ type: 'clock', size: '4x2' as const, col: 0, row: r * 2 }));
    const plan = planPlacement(dashboard, { layout: layoutOf('desktop', rows) }, TYPE, meta, 4);

    expect(plan?.widget).toMatchObject({ col: 0, row: 8 });
  });

  it('replaces what a single-widget screen shows, at its one size, and names what it replaces', () => {
    const layout = layoutOf('q60', [{ type: 'clock', size: '2x4', col: 0, row: 0 }]);

    const plan = planPlacement(q60, { layout }, TYPE, meta, 6);

    expect(plan?.replaces).toBe('clock');
    expect(plan?.layout.pages[0].widgets).toEqual([expect.objectContaining({ type: TYPE, size: '2x4' })]);
  });

  it('uses the grid sizes an app declares on multi-widget screens, and each small screen\'s own size', () => {
    const gridOnly = { ...meta, defaultSize: '4x4' as const, gridSizes: ['4x4' as const] };
    const kraken: PlacementTarget = { key: 'stream-k', name: 'Kraken', iconSrc: null, surface: 'kraken' };
    const square: PlacementTarget = { key: 'stream-s', name: 'LCD', iconSrc: null, surface: 'lcd-square' };
    const empty = (surface: PanelLayout['surface']) => ({ layout: layoutOf(surface, []) });

    expect(planPlacement(dashboard, empty('desktop'), TYPE, gridOnly, 10)?.widget.size).toBe('4x4');
    expect(planPlacement(y70, empty('y70'), TYPE, gridOnly, 10)?.widget.size).toBe('4x4');
    expect(planPlacement(q60, empty('q60'), TYPE, gridOnly, 10)?.widget.size).toBe('2x4');
    expect(planPlacement(kraken, empty('kraken'), TYPE, gridOnly, 10)?.widget.size).toBe('2x2round');
    expect(planPlacement(square, empty('lcd-square'), TYPE, gridOnly, 10)?.widget.size).toBe('2x2');
  });

  it('offers nothing where the app already is', () => {
    const onQ60 = layoutOf('q60', [{ type: TYPE, size: '2x4', col: 0, row: 0 }]);
    const onY70 = layoutOf('y70', [{ type: TYPE, size: '4x2', col: 0, row: 0 }]);

    expect(planPlacement(q60, { layout: onQ60 }, TYPE, meta, 6)).toBeNull();
    expect(planPlacement(y70, { layout: onY70 }, TYPE, meta, 6)).toBeNull();
  });

  it('offers nothing on a surface the app does not list', () => {
    const plan = planPlacement(q60, { layout: layoutOf('q60', []) }, TYPE, { ...meta, surfaces: ['desktop', 'y70'] }, 6);

    expect(plan).toBeNull();
  });

  it('offers nothing on round glass to an app without the round tile', () => {
    const kraken: PlacementTarget = { key: 'stream-k', name: 'Kraken', iconSrc: null, surface: 'kraken' };
    const plan = planPlacement(kraken, { layout: layoutOf('kraken', []) }, TYPE, { ...meta, sizes: ['2x2', '4x2'] }, 6);

    expect(plan).toBeNull();
  });

  it('shows the page a multi-widget panel lands it on', () => {
    const full = Array.from({ length: 8 }, (_, r) => ({ type: 'clock', size: '4x2' as const, col: 0, row: r * 2 }));

    const plan = planPlacement(y70, { layout: layoutOf('y70', full) }, TYPE, { ...meta, singleInstance: false }, 6);

    expect(plan?.page.id).not.toBe('p0');
    expect(plan?.layout.activePageId).toBe(plan?.page.id);
  });
});

describe('placementTargets', () => {
  const panel = (key: string, extra: Partial<UnifiedDevice> = {}, panelExtra: Record<string, unknown> = {}): UnifiedDevice => ({
    key,
    shortName: key.toUpperCase(),
    name: key,
    subtitle: '',
    category: 'display',
    iconSrc: `/${key}.svg`,
    connected: true,
    kind: 'panel',
    navigable: true,
    nexusControlEnabled: true,
    supportsNexusControl: false,
    experimental: false,
    panelDevice: {
      id: key, name: key, subtitle: '', status: 'online', statusLabel: '', connectionKind: 'attached-monitor',
      managementMode: 'managed', surfaceProfileKey: key, runtimeSurface: 'q60', iconSrc: `/${key}.svg`,
      capabilities: { layout: true, theme: true, displayControls: false, launchClose: false, pairing: false, presence: false, touch: false },
      ...panelExtra,
    },
    ...extra,
  } as UnifiedDevice);

  it('leads with the dashboard and keeps only panels whose layout can be edited', () => {
    const targets = placementTargets('Apps dashboard', [
      panel('q60', {}, { panelRecordId: 'rec-1' }),
      panel('fan', { kind: 'curated', panelDevice: undefined }),
      panel('mirror', {}, { capabilities: { layout: false } }),
      panel('off', { nexusControlEnabled: false }),
    ]);

    expect(targets.map(t => t.key)).toEqual([DASHBOARD_TARGET_KEY, 'q60']);
    expect(targets[1]).toMatchObject({ name: 'Q60', surface: 'q60', panelRecordId: 'rec-1', iconSrc: '/q60.svg' });
  });
});

describe('commitPlacement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    savePreferences.mockResolvedValue({});
    patchPanelDevice.mockResolvedValue({});
  });

  it('writes the dashboard into the preferences and tells open layouts to re-read', async () => {
    fetchPreferences.mockResolvedValue({ panel: { dashboardLayout: layoutOf('desktop', []) } });

    expect(await commitPlacement(dashboard, TYPE, meta, 6)).toBe(true);

    const saved = savePreferences.mock.calls[0][0] as { panel: { dashboardLayout: PanelLayout } };
    expect(saved.panel.dashboardLayout.pages[0].widgets).toEqual([expect.objectContaining({ type: TYPE })]);
    expect(broadcastLayoutChanged).toHaveBeenCalled();
  });

  it('writes nothing when the current layout cannot be read', async () => {
    fetchPreferences.mockResolvedValue(null);
    fetchPanelDevices.mockResolvedValue(null);

    expect(await commitPlacement(dashboard, TYPE, meta, 6)).toBe(false);
    expect(await commitPlacement(q60, TYPE, meta, 6)).toBe(false);
    expect(savePreferences).not.toHaveBeenCalled();
    expect(patchPanelDevice).not.toHaveBeenCalled();
    expect(allocatePanelDevice).not.toHaveBeenCalled();
  });

  it('writes to the record bound to the surface, skipping display-owned ones', async () => {
    const record = (id: string, extra: Partial<PanelDeviceRecord> = {}): PanelDeviceRecord => ({
      id, displayName: id, firstSeenAt: 0, lastSeenAt: 0, capabilities: { surface: 'q60' }, ...extra,
    } as PanelDeviceRecord);
    fetchPanelDevices.mockResolvedValue({ devices: [record('display-owned', { displayId: 'd1' }), record('rec-q60')] });

    expect(await commitPlacement(q60, TYPE, meta, 6)).toBe(true);

    expect(patchPanelDevice).toHaveBeenCalledWith('rec-q60', expect.objectContaining({ layout: expect.any(Object) }));
  });

  it('allocates a record for a surface that never connected', async () => {
    fetchPanelDevices.mockResolvedValue({ devices: [] });
    allocatePanelDevice.mockResolvedValue({ id: 'new-rec' });

    expect(await commitPlacement(q60, TYPE, meta, 6)).toBe(true);

    expect(allocatePanelDevice).toHaveBeenCalledWith({ surface: 'q60' }, 'q60 panel');
    expect(patchPanelDevice).toHaveBeenCalledWith('new-rec', expect.anything());
  });
});
