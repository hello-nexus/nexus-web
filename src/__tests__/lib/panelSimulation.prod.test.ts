import { beforeEach, describe, expect, it, vi } from 'vitest';

// Force a production build: dev tools off. Must precede the import under test.
vi.mock('../../lib/devTools', () => ({ DEV_TOOLS: false }));

import {
  getConnectedSimulatedPanelIds,
  getConnectedSimulatedPanels,
  setSimulatedPanelConnected,
  setY70Simulated,
} from '../../lib/panelSimulation';

describe('panelSimulation without dev tools', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('ignores persisted simulated panels so a prod build is not stuck with dev-build selections', () => {
    // Simulate a dev build having left panels connected in localStorage.
    setY70Simulated(true);
    setSimulatedPanelConnected('q60', true);

    expect(getConnectedSimulatedPanelIds()).toEqual([]);
    expect(getConnectedSimulatedPanels()).toEqual([]);
  });
});
