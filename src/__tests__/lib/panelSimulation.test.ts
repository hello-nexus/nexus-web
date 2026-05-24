import { beforeEach, describe, expect, it } from 'vitest';
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
  setY70Simulated,
} from '../../lib/panelSimulation';

describe('panelSimulation', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('includes a named tablet preset for common-size UI testing', () => {
    expect(SIMULATED_PANEL_PRESETS).toContainEqual({
      id: 'tablet',
      name: 'Tablet Panel',
      surface: 'phone',
      width: 1640,
      height: 2360,
      dpi: 264,
    });
  });

  it('uses iPhone 17 Pro resolution for the phone preset', () => {
    expect(SIMULATED_PANEL_PRESETS).toContainEqual({
      id: 'phone',
      name: 'Phone Panel',
      surface: 'phone',
      width: 1206,
      height: 2622,
      dpi: 460,
    });
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
      name: 'Q60',
      surface: 'q60',
      width: 720,
      height: 1280,
      dpi: 220,
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
