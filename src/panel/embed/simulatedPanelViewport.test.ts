import { describe, expect, it } from 'vitest';
import { simulatedPanelCssViewport, simulatedPanelEditorCapacity } from './simulatedPanelViewport';
import { panelGridCapacityForCanvas } from '../engine/grid';
import {
  DEFAULT_SIMULATED_PANEL_GRID_SIZING,
  SIMULATED_PANEL_PRESETS,
  setPanelGridSizingSettings,
} from '../../lib/panelSimulation';

function preset(id: string) {
  const p = SIMULATED_PANEL_PRESETS.find(p => p.id === id);
  if (!p) throw new Error(`preset ${id} missing`);
  return p;
}

describe('simulatedPanelEditorCapacity', () => {
  it('gives the tablet preset the device-true 8x10 grid', () => {
    const p = preset('tablet');
    expect(simulatedPanelEditorCapacity(p.surface, p.width, p.height, p.dpi))
      .toEqual({ gridCols: 8, pageRows: 10 });
  });

  it('gives the phone preset a 4x8 grid', () => {
    const p = preset('phone');
    expect(simulatedPanelEditorCapacity(p.surface, p.width, p.height, p.dpi))
      .toEqual({ gridCols: 4, pageRows: 8 });
  });

  it('gives the Xeneon Edge preset the 14x4 landscape grid', () => {
    const p = preset('xeneon-edge');
    expect(simulatedPanelEditorCapacity(p.surface, p.width, p.height, p.dpi))
      .toEqual({ gridCols: 14, pageRows: 4 });
  });

  it('honors the short-side jump sizing knob', () => {
    const p = preset('tablet');
    setPanelGridSizingSettings({ shortSideJumpAtInches: 7 });
    try {
      expect(simulatedPanelEditorCapacity(p.surface, p.width, p.height, p.dpi).gridCols).toBe(4);
    } finally {
      setPanelGridSizingSettings(DEFAULT_SIMULATED_PANEL_GRID_SIZING);
    }
  });

  // Guards the two halves of the helper drifting apart: capacity must equal
  // the grid math applied to the exact CSS viewport the helper itself reports
  // (which is also what sizes the simulator iframe).
  it('matches panelGridCapacityForCanvas on its own reported viewport for every preset', () => {
    for (const p of SIMULATED_PANEL_PRESETS) {
      const v = simulatedPanelCssViewport(p.surface, p.width, p.height, p.dpi);
      const expected = panelGridCapacityForCanvas(v.cssWidth, v.cssHeight, {
        surface: p.surface,
        dpi: v.cssDpi,
      });
      expect(simulatedPanelEditorCapacity(p.surface, p.width, p.height, p.dpi), p.id)
        .toEqual({ gridCols: expected.columns, pageRows: expected.rows });
    }
  });
});
