import { beforeEach, describe, expect, it, vi } from 'vitest';

const allocatePanelDevice = vi.fn();
const deletePanelDevice = vi.fn();
const fetchPanelDevices = vi.fn();
const patchPanelDevice = vi.fn();
vi.mock('../../api/panel', () => ({
  allocatePanelDevice: (...a: unknown[]) => allocatePanelDevice(...a),
  deletePanelDevice: (...a: unknown[]) => deletePanelDevice(...a),
  fetchPanelDevices: (...a: unknown[]) => fetchPanelDevices(...a),
  patchPanelDevice: (...a: unknown[]) => patchPanelDevice(...a),
}));

import { defaultLayoutForSurface } from '../../panel/engine/defaultLayout';
import {
  formatPanelInches,
  getConnectedSimulatedPanelIds,
  getConnectedSimulatedPanels,
  getCustomSimulatedPanel,
  getSimulatedPanelGridCapacity,
  getSimulatedPanelPhysicalSize,
  isY70Simulated,
  SIMULATED_PANEL_PRESETS,
  setCustomSimulatedPanelSize,
  setSimulatedPanelConnected,
  ensureSimulatedPanelRecord,
  persistSimulatorDefaultLayout,
  getSimulatedPanelRecordId,
  setY70Simulated,
} from '../../lib/panelSimulation';

type StoredLayout = { surface: string; layoutSchemaVersion: number; pages: Array<{ widgets: Array<{ type: string; size: string; col: number; row: number }> }> };
// Default layouts carry generated ids; compare what they place.
const shape = (l: StoredLayout) => ({
  surface: l.surface,
  version: l.layoutSchemaVersion,
  widgets: l.pages.map(pg => pg.widgets.map(w => [w.type, w.size, w.col, w.row])),
});

const service = new Map<string, { id: string; layout: unknown; widgetSize?: string }>();

describe('panelSimulation', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    let n = 0;
    // Stands in for the service: the list returns stored records, a null layout until a PATCH writes one.
    service.clear();
    allocatePanelDevice.mockImplementation(async () => {
      const id = `rec-${++n}`;
      service.set(id, { id, layout: null });
      return { id };
    });
    deletePanelDevice.mockImplementation(async (id: string) => { service.delete(id); return { error: false }; });
    fetchPanelDevices.mockImplementation(async () => ({ devices: [...service.values()] }));
    patchPanelDevice.mockImplementation(async (id: string, patch: { layout?: unknown }) => {
      const record = service.get(id);
      if (!record) return null;
      record.layout = patch.layout ?? record.layout;
      return { ...record };
    });
  });

  it('includes a named tablet preset for common-size UI testing', () => {
    expect(SIMULATED_PANEL_PRESETS).toContainEqual(expect.objectContaining({
      id: 'tablet',
      name: 'Tablet Panel',
      surface: 'phone',
      width: 1640,
      height: 2360,
      dpi: 264,
    }));
  });

  it('uses iPhone 17 Pro resolution for the phone preset', () => {
    expect(SIMULATED_PANEL_PRESETS).toContainEqual(expect.objectContaining({
      id: 'phone',
      name: 'Phone Panel',
      surface: 'phone',
      width: 1206,
      height: 2622,
      dpi: 460,
    }));
  });

  it('carries the Kraken round glass as a single-tile 640x640 preset', () => {
    expect(SIMULATED_PANEL_PRESETS).toContainEqual(expect.objectContaining({
      id: 'kraken',
      name: 'NZXT Kraken Elite V2',
      surface: 'lcd-round',
      width: 640,
      height: 640,
      dpi: 240,
    }));

    const kraken = SIMULATED_PANEL_PRESETS.find(panel => panel.id === 'kraken');

    // One 2x2 round tile, the same grid the real streamed Kraken reports.
    expect(kraken && getSimulatedPanelGridCapacity(kraken)).toMatchObject({ columns: 2, rows: 2 });
  });

  it('calculates physical inches and assigns tablets a larger power-of-two grid than phones', () => {
    const phone = SIMULATED_PANEL_PRESETS.find(panel => panel.id === 'phone');
    const tablet = SIMULATED_PANEL_PRESETS.find(panel => panel.id === 'tablet');

    expect(phone && formatPanelInches(getSimulatedPanelPhysicalSize(phone).shortSideInches)).toBe('2.6 in');
    expect(phone && formatPanelInches(getSimulatedPanelPhysicalSize(phone).diagonalInches)).toBe('6.3 in');
    expect(tablet && formatPanelInches(getSimulatedPanelPhysicalSize(tablet).shortSideInches)).toBe('6.2 in');
    expect(tablet && formatPanelInches(getSimulatedPanelPhysicalSize(tablet).diagonalInches)).toBe('10.9 in');
    expect(phone && getSimulatedPanelGridCapacity(phone)).toMatchObject({ columns: 4, rows: 8 });
    expect(tablet && getSimulatedPanelGridCapacity(tablet)).toMatchObject({ columns: 8, rows: 10 });
  });

  it('ignores a grid jump cutoff an earlier build saved, and drops it', async () => {
    localStorage.setItem('nexus_simulated_panel_grid_sizing', JSON.stringify({ shortSideJumpAtInches: 7 }));
    vi.resetModules();
    const fresh = await import('../../lib/panelSimulation');
    const tablet = fresh.SIMULATED_PANEL_PRESETS.find(panel => panel.id === 'tablet');

    expect(fresh.getPanelGridSizingSettings()).toEqual(fresh.DEFAULT_SIMULATED_PANEL_GRID_SIZING);
    expect(localStorage.getItem('nexus_simulated_panel_grid_sizing')).toBeNull();
    expect(tablet && fresh.getSimulatedPanelGridCapacity(tablet)).toMatchObject({ columns: 8 });
  });

  it('uses the real Q60 resolution and derives a 2x4 widget grid', () => {
    const q60 = SIMULATED_PANEL_PRESETS.find(panel => panel.id === 'q60');

    expect(q60).toMatchObject({
      id: 'q60',
      name: 'HYTE Q60',
      surface: 'q60',
      width: 720,
      height: 1280,
      dpi: 240,
    });
    expect(q60 && getSimulatedPanelGridCapacity(q60)).toMatchObject({
      columns: 2,
      rows: 4,
    });
  });

  it('keeps the legacy Y70 toggle compatible with generic simulated panels', () => {
    expect(isY70Simulated()).toBe(false);

    setY70Simulated(true);

    expect(isY70Simulated()).toBe(true);
    expect(getConnectedSimulatedPanelIds()).toContain('y70');

    setY70Simulated(false);

    expect(getConnectedSimulatedPanelIds()).not.toContain('y70');
  });

  it('returns connected panel definitions for multiple fake devices', () => {
    setSimulatedPanelConnected('q60', true);
    setSimulatedPanelConnected('phone', true);

    const panels = getConnectedSimulatedPanels();

    expect(panels.map(panel => panel.id)).toEqual(['q60', 'phone']);
    expect(panels.find(panel => panel.id === 'q60')).toMatchObject({
      surface: 'q60',
      width: 720,
      height: 1280,
    });
  });

  it('maps the ids of replaced generic presets to the real model and drops duplicates', () => {
    localStorage.setItem('nexus_simulated_panel_ids', JSON.stringify(['lcd-round-480', 'lcd-wide-1600', 'corsair-link-lcd']));

    expect(getConnectedSimulatedPanelIds()).toEqual(['corsair-link-lcd', 'thermalright-wonder-vision']);
  });

  describe('simulator records', () => {
    it('allocates a surface-less record when a simulator is added and keeps it per simulator', async () => {
      setSimulatedPanelConnected('lianli-tl-lcd-flex', true);
      setSimulatedPanelConnected('lianli-tl-lcd', true);
      await ensureSimulatedPanelRecord('lianli-tl-lcd-flex');
      await ensureSimulatedPanelRecord('lianli-tl-lcd');

      expect(allocatePanelDevice).toHaveBeenCalledTimes(2);
      for (const call of allocatePanelDevice.mock.calls) expect(call[0]).toBeUndefined();
      const a = getSimulatedPanelRecordId('lianli-tl-lcd-flex');
      const b = getSimulatedPanelRecordId('lianli-tl-lcd');
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      expect(a).not.toBe(b);
    });

    it('reuses the stored record while it still exists and reallocates when it is gone', async () => {
      setSimulatedPanelConnected('q60', true);
      await ensureSimulatedPanelRecord('q60');
      const first = getSimulatedPanelRecordId('q60');

      await expect(ensureSimulatedPanelRecord('q60')).resolves.toBe(first);
      expect(allocatePanelDevice).toHaveBeenCalledTimes(1);

      service.delete(first!);
      await ensureSimulatedPanelRecord('q60');
      expect(allocatePanelDevice).toHaveBeenCalledTimes(2);
      expect(getSimulatedPanelRecordId('q60')).not.toBe(first);
    });

    it('keeps the stored record when the list cannot be read', async () => {
      setSimulatedPanelConnected('q60', true);
      await ensureSimulatedPanelRecord('q60');
      const first = getSimulatedPanelRecordId('q60');

      fetchPanelDevices.mockResolvedValue(null);
      await expect(ensureSimulatedPanelRecord('q60')).resolves.toBe(first);
      fetchPanelDevices.mockRejectedValue(new Error('offline'));
      await expect(ensureSimulatedPanelRecord('q60')).resolves.toBe(first);
      expect(allocatePanelDevice).toHaveBeenCalledTimes(1);
      expect(deletePanelDevice).not.toHaveBeenCalled();
    });

    it('ignores non-string entries in the stored record map', () => {
      localStorage.setItem('nexus_simulated_panel_records', JSON.stringify({ q60: { x: 1 }, phone: 5, tablet: '', y70: 'rec-y' }));

      expect(getSimulatedPanelRecordId('q60')).toBeUndefined();
      expect(getSimulatedPanelRecordId('phone')).toBeUndefined();
      expect(getSimulatedPanelRecordId('tablet')).toBeUndefined();
      expect(getSimulatedPanelRecordId('y70')).toBe('rec-y');
    });

    it('persists the full surface default layout before the id is published or returned', async () => {
      setSimulatedPanelConnected('lianli-tl-lcd-flex', true);
      const seen: Array<string | undefined> = [];
      patchPanelDevice.mockImplementationOnce(async (id: string, patch: { layout: unknown }) => {
        seen.push(getSimulatedPanelRecordId('lianli-tl-lcd-flex'));
        service.get(id)!.layout = patch.layout;
        return { id };
      });

      const returned = await ensureSimulatedPanelRecord('lianli-tl-lcd-flex');

      expect(seen).toEqual([undefined]);
      expect(getSimulatedPanelRecordId('lianli-tl-lcd-flex')).toBe(returned);
      const layout = service.get(returned!)!.layout as StoredLayout;
      expect(layout.surface).toBe('lcd-round');
      expect(shape(layout)).toEqual(shape(defaultLayoutForSurface('lcd-round') as unknown as StoredLayout));
      expect(layout.pages.length).toBeGreaterThan(0);
    });

    it('still publishes the id when the default PATCH fails, and writes the default on a later call', async () => {
      setSimulatedPanelConnected('q60', true);
      patchPanelDevice.mockResolvedValueOnce(null);

      const id = await ensureSimulatedPanelRecord('q60');
      expect(getSimulatedPanelRecordId('q60')).toBe(id);
      expect(service.get(id!)!.layout).toBeNull();

      await expect(ensureSimulatedPanelRecord('q60')).resolves.toBe(id);
      expect(shape(service.get(id!)!.layout as StoredLayout)).toEqual(shape(defaultLayoutForSurface('q60') as unknown as StoredLayout));
      expect(allocatePanelDevice).toHaveBeenCalledTimes(1);
    });

    it('heals a layout-less record at the surface its stored Widget size lays out as', async () => {
      setSimulatedPanelConnected('q60', true);
      const id = await ensureSimulatedPanelRecord('q60');
      Object.assign(service.get(id!)!, { layout: null, widgetSize: 'small' });

      await ensureSimulatedPanelRecord('q60');

      expect((service.get(id!)!.layout as StoredLayout).surface).toBe('monitor');
    });

    it('allocates and writes the default once for concurrent callers', async () => {
      setSimulatedPanelConnected('q60', true);
      await Promise.all([ensureSimulatedPanelRecord('q60'), ensureSimulatedPanelRecord('q60')]);

      expect(allocatePanelDevice).toHaveBeenCalledTimes(1);
      expect(patchPanelDevice).toHaveBeenCalledTimes(1);
    });

    it('does not rewrite a stored layout', async () => {
      setSimulatedPanelConnected('q60', true);
      const id = await ensureSimulatedPanelRecord('q60');
      service.get(id!)!.layout = { custom: true };
      patchPanelDevice.mockClear();

      await ensureSimulatedPanelRecord('q60');

      expect(patchPanelDevice).not.toHaveBeenCalled();
    });

    it('returns undefined and deletes the record when the simulator is removed during the default PATCH', async () => {
      setSimulatedPanelConnected('q60', true);
      patchPanelDevice.mockImplementationOnce(async () => {
        setSimulatedPanelConnected('q60', false);
        return { ok: true };
      });

      await expect(ensureSimulatedPanelRecord('q60')).resolves.toBeUndefined();
      expect(getSimulatedPanelRecordId('q60')).toBeUndefined();
      expect(service.size).toBe(0);
    });

    it('lays a family with a Widget size out as that size default surface', async () => {
      await persistSimulatorDefaultLayout('icue-link-lcd5', 'rec-x');

      expect(patchPanelDevice).toHaveBeenCalledWith('rec-x', { layout: expect.objectContaining({ surface: 'monitor' }) });
    });

    it('allocates once for concurrent callers', async () => {
      setSimulatedPanelConnected('q60', true);
      const [a, b] = await Promise.all([ensureSimulatedPanelRecord('q60'), ensureSimulatedPanelRecord('q60')]);

      expect(a).toBe(b);
      expect(allocatePanelDevice).toHaveBeenCalledTimes(1);
    });

    it('deletes the record it created when the simulator is removed', async () => {
      setSimulatedPanelConnected('q60', true);
      await ensureSimulatedPanelRecord('q60');
      const recordId = getSimulatedPanelRecordId('q60');

      setSimulatedPanelConnected('q60', false);

      expect(deletePanelDevice).toHaveBeenCalledWith(recordId);
      expect(getSimulatedPanelRecordId('q60')).toBeUndefined();
    });

    it('deletes a record that finishes allocating after its simulator was removed', async () => {
      setSimulatedPanelConnected('q60', true);
      setSimulatedPanelConnected('q60', false);
      await ensureSimulatedPanelRecord('q60');

      expect(deletePanelDevice).toHaveBeenCalledTimes(1);
      expect(getSimulatedPanelRecordId('q60')).toBeUndefined();
    });

    it('never deletes anything when a simulator without a record is removed', () => {
      setSimulatedPanelConnected('phone', false);

      expect(deletePanelDevice).not.toHaveBeenCalled();
    });
  });

  it('ignores malformed connected-panel storage', () => {
    localStorage.setItem('nexus_simulated_panel_ids', JSON.stringify({ y70: true }));

    expect(getConnectedSimulatedPanelIds()).toEqual([]);

    localStorage.setItem('nexus_simulated_panel_ids', JSON.stringify('q60'));

    expect(getConnectedSimulatedPanelIds()).toEqual([]);
  });

  it('clamps and persists custom panel dimensions', () => {
    setCustomSimulatedPanelSize(120, 5000, 460);

    expect(getCustomSimulatedPanel()).toMatchObject({
      id: 'custom',
      surface: 'phone',
      width: 240,
      height: 4096,
      dpi: 460,
    });
  });
});
