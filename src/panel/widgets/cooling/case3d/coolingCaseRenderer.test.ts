import { describe, expect, it, vi } from 'vitest';
import type { CaseLayout } from '../../../../lib/cooling/caseLayout';

const made = vi.hoisted(() => [] as { forceContextLoss: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; calls: string[] }[]);
const drawn = vi.hoisted(() => [] as { children: unknown[] }[]);

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
    render(scene: { children: unknown[] }) { drawn.push(scene); }
  }
  return { ...actual, WebGLRenderer: FakeRenderer };
});

const layers = vi.hoisted(() => ({ created: 0, disposed: 0, host: null as null | { parent: { children: { matrixWorld: { elements: number[] }; position: { length(): number }; scale: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number } }[] } | null } }));
vi.mock('../../../../lib/cooling/flow/flowLayer', () => ({
  FlowLayer: class {
    supported = true;
    constructor(_renderer: unknown, host: never) { layers.created++; layers.host = host; }
    setOptions() {}
    setInput() {}
    setTemps() {}
    frame() {}
    get active() { return false; }
    dispose() { layers.disposed++; }
  },
}));

import { LineBasicMaterial, LineDashedMaterial, Color } from 'three';
import { Group } from 'three';
import y70 from '../../../../lib/cooling/__fixtures__/y70-case-layout.json';
import { parseCaseLayout } from '../../../../lib/cooling/caseLayout';
import { buildCase, scenePalette, type SceneLayout } from '../../../../lib/scene/pcScene';
import { sceneSignature } from '../../../../lib/scene/pcSceneSignature';
import { createCaseRenderer, ringMaterial } from './coolingCaseRenderer';

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
      r.setState({ layout, directions: {}, highlighted: new Set(), bound: new Set(), simulated: new Set(), showCase: true, active: null, flow: null, flowOptions: { particles: true, collisions: false, speed: 1.5 } });
      r.dispose();
    }
    expect(made).toHaveLength(20);
    for (const m of made) {
      expect(m.forceContextLoss).toHaveBeenCalledTimes(1);
      expect(m.dispose).toHaveBeenCalledTimes(1);
      expect(m.calls).toEqual(['forceContextLoss', 'dispose']);
    }
  });

  it('keeps the flow layer through a fan edit and rebuilds it only when the case shape changes', () => {
    layers.created = 0;
    layers.disposed = 0;
    const r = createCaseRenderer(document.createElement('canvas'), () => {});
    const state = (l: CaseLayout) => ({ layout: l, directions: {}, highlighted: new Set<string>(), bound: new Set<string>(), simulated: new Set<string>(), showCase: true, active: null, flow: null, flowOptions: { particles: true, collisions: false, speed: 1.5 } });
    r.setState(state(layout));
    const edited: CaseLayout = { ...layout, fanSlots: layout.fanSlots.map(s => ({ ...s, taken: 'fan' as const })) };
    r.setState(state(edited));
    expect(layers.created).toBe(1);
    expect(layers.disposed).toBe(0);
    r.setState(state({ ...edited, size: [500, 230, 470] }));
    expect(layers.created).toBe(2);
    expect(layers.disposed).toBe(1);
    r.dispose();
  });
});

describe('ringMaterial', () => {
  it('draws a simulated fan ring dashed and a real one solid', () => {
    const dashed = ringMaterial(new Color('#fff'), 1, 40, true);
    expect(dashed).toBeInstanceOf(LineDashedMaterial);
    expect((dashed as LineDashedMaterial).dashSize).toBeGreaterThan(0);
    expect(ringMaterial(new Color('#fff'), 1, 40, false)).toBeInstanceOf(LineBasicMaterial);
    expect(ringMaterial(new Color('#fff'), 1, 40, false)).not.toBeInstanceOf(LineDashedMaterial);
  });
});

describe('pick gesture', () => {
  const press = (canvas: HTMLCanvasElement, from: [number, number], to: [number, number]) => {
    canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: from[0], clientY: from[1] }));
    canvas.dispatchEvent(new MouseEvent('pointerup', { clientX: to[0], clientY: to[1] }));
  };

  it('reports empty space for a click and nothing for a drag', () => {
    const canvas = document.createElement('canvas');
    // jsdom has no pointer capture, which the orbit controls call on a press.
    canvas.setPointerCapture = () => {};
    canvas.releasePointerCapture = () => {};
    const onPick = vi.fn();
    const r = createCaseRenderer(canvas, onPick);
    press(canvas, [50, 50], [51, 50]);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0]).toBeNull();
    press(canvas, [50, 50], [90, 80]);
    expect(onPick).toHaveBeenCalledTimes(1);
    r.dispose();
  });
});

describe('one transform from layout mm', () => {
  it('draws the outline, the fans and the airflow layer (particles and collision shapes) in the same untransformed space', () => {
    const r = createCaseRenderer(document.createElement('canvas'), () => {});
    r.setState({ layout, directions: {}, highlighted: new Set(), bound: new Set(), simulated: new Set(), showCase: true, active: null, flow: null, flowOptions: { particles: true, collisions: true, speed: 1 } });
    const groups = layers.host?.parent?.children ?? [];
    expect(groups.length).toBeGreaterThanOrEqual(3);
    for (const g of groups) {
      expect(g.position.length()).toBe(0);
      expect([g.scale.x, g.scale.y, g.scale.z]).toEqual([1, 1, 1]);
      expect([g.rotation.x, g.rotation.y, g.rotation.z]).toEqual([0, 0, 0]);
    }
    r.dispose();
  });
});

describe('the case is Build\'s scene', () => {
  it('draws the case through the shared scene module, the same graph Build builds for the same layout', () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1; });
    drawn.length = 0;
    const canvas = document.createElement('canvas');
    const r = createCaseRenderer(canvas, () => {});
    const parsed = parseCaseLayout(y70)!;
    r.setState({ layout: parsed, directions: {}, highlighted: new Set(), bound: new Set(), simulated: new Set(), showCase: true, active: null, flow: null, flowOptions: { particles: true, collisions: false, speed: 1 } });
    // The scene's first child is the case group; its one child holds Build's case, centered as Build centers it.
    const staticGroup = drawn.at(-1)!.children[0] as Group;
    const [D, W, H] = parsed.size;
    const expected = new Group();
    expected.position.set(D / 2, H / 2, W / 2);
    // Build's call for a still view of a case; the fan boxes and rings are this view's interactive overlay, so they are the one thing left out.
    expected.add(buildCase({ lines: [], ...y70 } as SceneLayout, scenePalette(canvas), [], [], [], true, false, true, true));
    expect(staticGroup.children).toHaveLength(1);
    expect(sceneSignature(staticGroup.children[0])).toEqual(sceneSignature(expected));
    r.dispose();
    vi.unstubAllGlobals();
  });
});
