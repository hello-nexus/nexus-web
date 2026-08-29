// Every simulated panel must render at the aspect of the hardware it stands in
// for. The table stores NATIVE pixels and the viewport helper divides by the
// surface DPR, so a CSS-space value written into it renders visibly wrong -
// which is exactly how the custom panel ended up 1.5x too wide.
import { describe, it, expect } from 'vitest';
import { simulatedPanelCssViewport } from './simulatedPanelViewport';
import { SIMULATED_PANEL_PRESETS, getCustomSimulatedPanel } from '../../lib/panelSimulation';

/** A real Y70 is CSS 734x2560. Both Y70 presets and the custom default stand in
 *  for that one display, so they must all land near its shape. Other surfaces
 *  deliberately cover several devices (the phone surface carries both a phone
 *  and a tablet), so there is no single aspect to hold them to. */
const REAL_Y70 = 734 / 2560;

describe('simulated panel aspect', () => {
  it('renders every preset at its own native aspect', () => {
    for (const p of SIMULATED_PANEL_PRESETS) {
      const v = simulatedPanelCssViewport(p.surface, p.width, p.height, p.dpi);
      const native = p.width / p.height;
      const rendered = v.cssWidth / v.cssHeight;
      // Dividing both axes by one DPR must not change the shape.
      expect(Math.abs(rendered - native) / native, `${p.name} distorted`).toBeLessThan(0.01);
    }
  });

  it('keeps every Y70 preset close to real Y70 hardware', () => {
    for (const p of SIMULATED_PANEL_PRESETS.filter((x) => x.surface === 'y70')) {
      const got = p.width / p.height;
      expect(Math.abs(got - REAL_Y70) / REAL_Y70, `${p.name} is ${(got / REAL_Y70).toFixed(2)}x the real aspect`)
        .toBeLessThan(0.15);
    }
  });

  it('defaults the custom panel to a real Y70 shape, in native pixels', () => {
    const custom = getCustomSimulatedPanel();
    const got = custom.width / custom.height;
    expect(Math.abs(got - REAL_Y70) / REAL_Y70,
      `custom default is ${(got / REAL_Y70).toFixed(2)}x a real Y70`).toBeLessThan(0.15);
  });
});
