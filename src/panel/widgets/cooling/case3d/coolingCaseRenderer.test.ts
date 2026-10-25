import { describe, expect, it, vi } from 'vitest';
import type { CaseLayout } from '../../../../lib/cooling/caseLayout';

const made = vi.hoisted(() => [] as { forceContextLoss: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; calls: string[] }[]);

vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof import('three')>();
  class FakeRenderer {
    calls: string[] = [];
    forceContextLoss = vi.fn(() => { this.calls.push('forceContextLoss'); });
    dispose = vi.fn(() => { this.calls.push('dispose'); });
    extensions = { has: () => false };
    constructor() { made.push(this); }
    setPixelRatio() {}
    setSize() {}
    render() {}
  }
  return { ...actual, WebGLRenderer: FakeRenderer };
});

import { createCaseRenderer } from './coolingCaseRenderer';

const layout: CaseLayout = {
  size: [450, 230, 470],
  boxes: [],
  fanSlots: [
    { key: 'front:120:0', position: 'front', size: 120, index: 0, taken: 'fan', box: { min: [0, 10, 10], size: [25, 120, 120] }, axis: [1, 0, 0] },
    { key: 'top:120:0', position: 'top', size: 120, index: 0, taken: null, box: { min: [100, 440, 10], size: [120, 25, 120] }, axis: [0, -1, 0] },
  ],
};

// jsdom has no 2D context; the token reader falls back to its default colors.
HTMLCanvasElement.prototype.getContext = (() => null) as never;

describe('createCaseRenderer', () => {
  it('releases the WebGL context before disposing, once per renderer', () => {
    for (let i = 0; i < 20; i++) {
      const r = createCaseRenderer(document.createElement('canvas'), () => {});
      r.setState({ layout, directions: {}, highlighted: new Set(), bound: new Set(), active: null, flow: null, flowOptions: { particles: true, deadZones: false, debugSolids: false } });
      r.dispose();
    }
    expect(made).toHaveLength(20);
    for (const m of made) {
      expect(m.forceContextLoss).toHaveBeenCalledTimes(1);
      expect(m.dispose).toHaveBeenCalledTimes(1);
      expect(m.calls).toEqual(['forceContextLoss', 'dispose']);
    }
  });
});
