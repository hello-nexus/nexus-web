// Regression: the keeb card must remain reachable in the Devices view
// even when the keeb reports `connected: false`. The customization modal's
// Settings tab is offline-functional (firmware lighting, game mode, macros
// all written to persistence), so the user expects to click into it
// regardless of physical attachment. Bench-found 2026-05-21: when the
// keeb hot-swap host hadn't picked up the device, the curated card
// disappeared and the user had no way to open the modal.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const KEEB_DISCONNECTED = {
  id: 'keeb',
  name: 'HYTE Keeb TKL',
  category: 'keyboard',
  connected: false,
  firmwareVersion: '',
};

const OTHER_DISCONNECTED = {
  id: 'fan-hub',
  name: 'iBUYPOWER MiniHub',
  category: 'fan-hub',
  connected: false,
  firmwareVersion: '',
};

vi.mock('./useDevices', () => ({
  useDevices: () => [KEEB_DISCONNECTED, OTHER_DISCONNECTED],
}));
vi.mock('./usePeripherals', () => ({
  usePeripherals: () => ({ peripherals: [] }),
}));
vi.mock('../lib/webhid/useWebHidPeripherals', () => ({
  useWebHidPeripherals: () => ({ peripherals: [], available: false, requestDevice: async () => null }),
}));
vi.mock('./usePanelDevices', () => ({
  usePanelDevices: () => ({ devices: [] }),
}));
vi.mock('../panel/panelSimulation', () => ({
  PANEL_SIMULATION_CHANGED_EVENT: 'panelSimulationChanged',
  getConnectedSimulatedPanels: () => [],
}));

import { useUnifiedDevices } from './useUnifiedDevices';

describe('useUnifiedDevices — keeb visibility', () => {
  it('includes the keeb card even when reported as disconnected', () => {
    const { result } = renderHook(() => useUnifiedDevices(true));
    const keeb = result.current.unified.find(d => d.curatedId === 'keeb');
    expect(keeb).toBeDefined();
    expect(keeb?.connected).toBe(false);
  });

  it('still filters out OTHER disconnected curated devices', () => {
    const { result } = renderHook(() => useUnifiedDevices(true));
    expect(result.current.unified.find(d => d.curatedId === 'fan-hub')).toBeUndefined();
  });
});
