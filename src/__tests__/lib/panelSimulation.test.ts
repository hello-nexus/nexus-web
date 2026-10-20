import { beforeEach, describe, expect, it, vi } from 'vitest';

const allocatePanelDevice = vi.fn();
const deletePanelDevice = vi.fn();
const fetchPanelDevice = vi.fn();
vi.mock('../../api/panel', () => ({
  allocatePanelDevice: (...a: unknown[]) => allocatePanelDevice(...a),
  deletePanelDevice: (...a: unknown[]) => deletePanelDevice(...a),
  fetchPanelDevice: (...a: unknown[]) => fetchPanelDevice(...a),
}));

import {
  formatPanelInches,
  getConnectedSimulatedPanelIds,
  getConnectedSimulatedPanels,
  getCustomSimulatedPanel,
  getPanelGridSizingSettings,
  getSimulatedPanelGridCapacity,
  getSimulatedPanelPhysicalSize,
  isY70Simulated,
  SIMULATED_PANEL_PRESETS,
  setPanelGridSizingSettings,
  setCustomSimulatedPanelSize,
  setSimulatedPanelConnected,
  ensureSimulatedPanelRecord,
  getSimulatedPanelRecordId,
  setY70Simulated,
} from '../../lib/panelSimulation';

describe('panelSimulation', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    let n = 0;
    allocatePanelDevice.mockImplementation(async () => ({ id: `rec-${++n}` }));
    deletePanelDevice.mockResolvedValue({ error: false });
    fetchPanelDevice.mockResolvedValue({ id: 'exists' });
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
      surface: 'kraken',
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

  it('persists the physical-size grid jump cutoff', () => {
    const tablet = SIMULATED_PANEL_PRESETS.find(panel => panel.id === 'tablet');

    setPanelGridSizingSettings({ shortSideJumpAtInches: 7 });

    expect(getPanelGridSizingSettings()).toEqual({ shortSideJumpAtInches: 7 });
    expect(tablet && getSimulatedPanelGridCapacity(tablet)).toMatchObject({ columns: 4 });
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

      fetchPanelDevice.mockResolvedValue(null);
      await ensureSimulatedPanelRecord('q60');
      expect(allocatePanelDevice).toHaveBeenCalledTimes(2);
      expect(getSimulatedPanelRecordId('q60')).not.toBe(first);
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
