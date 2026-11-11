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

const layers = vi.hoisted(() => ({ created: 0, disposed: 0, settling: false, host: null as null | { parent: { children: { matrixWorld: { elements: number[] }; position: { length(): number }; scale: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number } }[] } | null } }));
vi.mock('../../../../lib/cooling/flow/flowLayer', () => ({
  FlowLayer: class {
    supported = true;
    constructor(_renderer: unknown, host: never) { layers.created++; layers.host = host; }
    setOptions() {}
    setInput() {}
    setTemps() {}
    setSettlingListener(listener: ((settling: boolean) => void) | null) { listener?.(layers.settling); }
    frame() {}
    get active() { return false; }
    dispose() { layers.disposed++; }
  },
}));

import { LineBasicMaterial, LineDashedMaterial, Color } from 'three';
import { Group, Vector3 } from 'three';
import y70 from '../../../../lib/cooling/__fixtures__/y70-case-layout.json';
import { parseCaseLayout } from '../../../../lib/cooling/caseLayout';
import { buildCase, coolingPalette, scenePalette, type SceneLayout } from '../../../../lib/scene/pcScene';
import { sceneSignature } from '../../../../lib/scene/pcSceneSignature';
import { fanGeometries } from '../../../../lib/cooling/caseLayout';
import { fanRingFrame } from './fanRing';
import { projectToCanvas, type CanvasPoint } from './anchorProjection';
import { AIRFLOW_DIM, CASE_ONLY_DIM, createCaseRenderer, ringFaceShift, ringMaterial, rotorMaterial } from './coolingCaseRenderer';

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
    layers.settling = false;
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

describe('camera across rebuilds', () => {
  it('keeps the orbit view through a layout edit and reframes only for a different case shape', () => {
    const r = createCaseRenderer(document.createElement('canvas'), () => {});
    const state = (l: CaseLayout) => ({ layout: l, directions: {}, highlighted: new Set<string>(), bound: new Set<string>(), simulated: new Set<string>(), showCase: true, active: null, flow: null, flowOptions: { particles: true, collisions: false, speed: 1.5 } });
    r.setState(state(layout));
    const cam = r.camera;
    const framed = cam.position.clone();
    cam.position.set(11, 22, 33);
    r.setState(state({ ...layout, fanSlots: layout.fanSlots.map(s => ({ ...s, taken: 'fan' as const })) }));
    expect(cam.position.toArray()).toEqual([11, 22, 33]);
    r.setState(state({ ...layout, size: [500, 230, 470] }));
    expect(cam.position.toArray()).not.toEqual([11, 22, 33]);
    expect(cam.position.toArray()).not.toEqual(framed.toArray());
    r.dispose();
  });
});

describe('fan dimming while devices are selected in the list', () => {
  const ringOpacities = (filtering: boolean | undefined, highlighted: string[]) => {
    const r = createCaseRenderer(document.createElement('canvas'), () => {});
    r.setState({ layout, directions: {}, highlighted: new Set(highlighted), filtering, bound: new Set(), simulated: new Set(), showCase: true, active: null, flow: null, flowOptions: { particles: true, collisions: false, speed: 1 } });
    const found: number[] = [];
    const walk = (node: unknown) => {
      const n = node as { type?: string; material?: { opacity: number }; children?: unknown[] };
      if (n.type === 'LineLoop' && n.material) found.push(n.material.opacity);
      n.children?.forEach(walk);
    };
    walk(layers.host?.parent);
    r.dispose();
    return found;
  };

  it('dims every fan when the selected devices light no slot', () => {
    const idle = ringOpacities(undefined, []);
    const none = ringOpacities(true, []);
    expect(idle.length).toBeGreaterThan(0);
    expect(Math.max(...none)).toBeLessThan(Math.min(...idle.filter(o => o === 1)));
  });

  it('lights only the highlighted slot', () => {
    const one = ringOpacities(true, ['front:120:0']);
    expect(one.filter(o => o === 1)).toHaveLength(2);
    expect(Math.min(...one)).toBeLessThan(1);
  });
});

describe('ringFaceShift', () => {
  it('moves a card fan ring from the middle of the card to the face the air enters through', () => {
    expect(ringFaceShift('gpu:fan:0', 40, 1)).toBe(-20);
    expect(ringFaceShift('gpu:fan:1', 40, -1)).toBe(20);
  });

  it('leaves case, cooler and radiator fan rings on their own box', () => {
    for (const key of ['fan:front:0', 'cpu:fan:0', 'rad:fan:0']) expect(ringFaceShift(key, 25, 1)).toBe(0);
  });
});

describe('rotorMaterial', () => {
  it('dots the blades of a simulated fan only', () => {
    expect(rotorMaterial(new Color('#fff'), false, 800, true).uniforms.uDotted.value).toBe(1);
    expect(rotorMaterial(new Color('#fff'), false, 800, false).uniforms.uDotted.value).toBe(0);
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
    // Build's call for a still view of a case, with the Cooling view's own treatment: solid outlines, drawn back while the airflow runs. The fan boxes and rings are this view's interactive overlay, so they are the one thing left out.
    expected.add(buildCase({ lines: [], ...y70 } as SceneLayout, coolingPalette(canvas), [], [], [], true, false, true, true, true, AIRFLOW_DIM));
    expect(staticGroup.children).toHaveLength(1);
    expect(sceneSignature(staticGroup.children[0])).toEqual(sceneSignature(expected));
    r.dispose();
    vi.unstubAllGlobals();
  });

  it('draws the case on its own brighter than behind the airflow, still through the shared scene module', () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1; });
    drawn.length = 0;
    const canvas = document.createElement('canvas');
    const r = createCaseRenderer(canvas, () => {});
    const parsed = parseCaseLayout(y70)!;
    r.setState({ layout: parsed, directions: {}, highlighted: new Set(), bound: new Set(), simulated: new Set(), showCase: true, active: null, flow: null, flowOptions: { particles: false, collisions: false, speed: 1 } });
    // The scene's first child is the case group; its one child holds Build's case, centered as Build centers it.
    const staticGroup = drawn.at(-1)!.children[0] as Group;
    const [D, W, H] = parsed.size;
    const expected = new Group();
    expected.position.set(D / 2, H / 2, W / 2);
    // Build's call for a still view of a case, with the Cooling view's own treatment: solid outlines, drawn back while the airflow runs. The fan boxes and rings are this view's interactive overlay, so they are the one thing left out.
    expected.add(buildCase({ lines: [], ...y70 } as SceneLayout, coolingPalette(canvas), [], [], [], true, false, true, true, true, CASE_ONLY_DIM));
    expect(staticGroup.children).toHaveLength(1);
    expect(sceneSignature(staticGroup.children[0])).toEqual(sceneSignature(expected));
    r.dispose();
    vi.unstubAllGlobals();
  });
});

describe('settling listener', () => {
  it('hands a listener attached while the solve is settling the current state', () => {
    vi.stubGlobal('requestAnimationFrame', () => 1);
    const r = createCaseRenderer(document.createElement('canvas'), () => {});
    const parsed = parseCaseLayout(y70)!;
    try {
      r.setState({ layout: parsed, directions: {}, highlighted: new Set(), bound: new Set(), simulated: new Set(), rotors: new Map(), showCase: true, active: null, flow: null, flowOptions: { particles: true, collisions: false, speed: 1 } });
      layers.settling = true;
      const seen: boolean[] = [];
      r.setSettlingListener(s => seen.push(s));
      expect(seen).toEqual([true]);
    } finally {
      r.dispose();
      vi.unstubAllGlobals();
    }
  });
});

describe('frame rate with only rotors moving', () => {
  it('draws spinning rotors at the reduced rate once the camera is still and no air is drawn', () => {
    const queued: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { queued.push(cb); return queued.length; });
    const canvas = document.createElement('canvas');
    const r = createCaseRenderer(canvas, () => {});
    const parsed = parseCaseLayout(y70)!;
    const key = parsed.fanSlots[0].key;
    r.setState({ layout: parsed, directions: {}, highlighted: new Set(), bound: new Set(), simulated: new Set([key]), rotors: new Map([[key, 500]]), showCase: true, active: null, flow: null, flowOptions: { particles: false, collisions: false, speed: 1 } });
    const frames = (from: number, to: number) => {
      drawn.length = 0;
      for (let t = from; t <= to; t += 4) { const cb = queued.shift(); if (!cb) break; cb(t); }
      return drawn.length;
    };
    // Frame times share performance.now()'s clock, which camera interaction is stamped with.
    const base = performance.now() + 1000;
    frames(base, base + 600);
    const idle = frames(base + 1000, base + 1500);
    expect(idle).toBeGreaterThan(0);
    expect(idle).toBeLessThanOrEqual(Math.ceil(500 / (1000 / 30)) + 1);
    r.dispose();
    vi.unstubAllGlobals();
  });
});

describe('presses on the canvas', () => {
  it('reports a drag past a click\'s slop and not a plain click', () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1; });
    const canvas = document.createElement('canvas');
    // jsdom has no pointer capture, which the orbit controls ask for.
    canvas.setPointerCapture = vi.fn();
    canvas.releasePointerCapture = vi.fn();
    const onPick = vi.fn();
    const onDrag = vi.fn();
    const r = createCaseRenderer(canvas, onPick, onDrag);
    const press = (type: string, x: number, y: number) => canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
    press('pointerdown', 10, 10);
    press('pointerup', 30, 30);
    expect(onDrag).toHaveBeenCalledTimes(1);
    press('pointerdown', 10, 10);
    press('pointerup', 11, 11);
    expect(onDrag).toHaveBeenCalledTimes(1);
    r.dispose();
    vi.unstubAllGlobals();
  });
});

describe('case palette', () => {
  // jsdom has no 2D context, so the token reader returns each fallback: text f5f5f5, accent 3b82f6.
  it('Cooling draws parts in the theme text color while Build keeps the accent', () => {
    const host = document.createElement('div');
    host.style.setProperty('--accent', '#ff0000');
    host.style.setProperty('--text', '#f5f5f5');
    expect(coolingPalette(host).part.getHexString()).toBe('f5f5f5');
    expect(scenePalette(host).part.getHexString()).not.toBe('f5f5f5');
  });
});

describe('fan pill anchors sit on the drawn ring centers', () => {
  const turn = 0.5;
  const rotated = (v: [number, number, number]): [number, number, number] => new Vector3(...v).applyAxisAngle(new Vector3(0, 1, 0), turn).toArray() as [number, number, number];
  const mixed: CaseLayout = {
    size: [450, 230, 470],
    boxes: [],
    fanSlots: [
      { key: 'front:120:0', position: 'front', size: 120, index: 0, taken: 'fan', box: { min: [0, 10, 10], size: [25, 120, 120] }, axis: [1, 0, 0] },
      { key: 'top:120:0', position: 'top', size: 120, index: 0, taken: 'fan', box: { min: [100, 440, 10], size: [120, 25, 120] }, axis: [0, -1, 0] },
      { key: 'rear:120:0', position: 'rear', size: 120, index: 0, taken: 'fan', box: { min: [425, 10, 10], size: [25, 120, 120] }, axis: [-1, 0, 0] },
      { key: 'side:120:0', position: 'side', size: 120, index: 0, taken: 'fan', box: { min: [200, 10, 0], size: [120, 120, 25] }, axis: [0, 0, 1] },
      { key: 'rad:fan:0', position: 'top', size: 140, index: 1, taken: 'fan', box: { min: [250, 440, 10], size: [140, 25, 140] }, axis: [0, -1, 0] },
      { key: 'gpu:fan:0', position: 'bottom', size: 90, index: 0, taken: 'fan', box: { min: [120, 60, 40], size: [90, 300, 40] }, axis: [0, 1, 0] },
      { key: 'gpu:fan:1', position: 'bottom', size: 90, index: 1, taken: 'fan', box: { min: [300, 60, 100], size: [300, 40, 90], rotationY: turn }, axis: rotated([1, 0, 0]) },
      { key: 'side:120:1', position: 'side', size: 120, index: 1, taken: 'fan', box: { min: [200, 150, 0], size: [120, 120, 25], rotationY: turn }, axis: rotated([0, 0, 1]) },
    ],
  } as CaseLayout;

  const draw = () => {
    const r = createCaseRenderer(document.createElement('canvas'), () => {});
    r.setState({ layout: mixed, directions: {}, highlighted: new Set(), bound: new Set(), simulated: new Set(), showCase: true, active: null, flow: null, flowOptions: { particles: true, collisions: false, speed: 1 } });
    const scene = layers.host!.parent as unknown as Group;
    scene.updateMatrixWorld(true);
    // The scene adds the case, the fans, then the flow; each fan is one group whose first child is its tip ring, beside its pick box.
    const rings = scene.children[1].children.filter(g => g.children[0]?.type === 'LineLoop').map(g => g.children[0].getWorldPosition(new Vector3()));
    return { r, rings };
  };

  it('puts each slot anchor at the world center of its drawn ring, face shifted GPU fans included', () => {
    const { r, rings } = draw();
    const frames = fanGeometries(mixed).map(g => fanRingFrame(g.slot, g.box));
    expect(rings).toHaveLength(mixed.fanSlots.length);
    frames.forEach((f, i) => expect(f.center.distanceTo(rings[i])).toBeLessThan(1e-6));
    expect(frames.filter(f => f.faceShift !== 0)).toHaveLength(2);
    r.dispose();
  });

  it('keeps the projected anchor on the projected ring center from every camera angle', () => {
    const { r, rings } = draw();
    const frames = fanGeometries(mixed).map(g => fanRingFrame(g.slot, g.box));
    const target = new Vector3(225, 115, 235);
    const scratch = new Vector3();
    const a: CanvasPoint = { x: 0, y: 0, visible: false };
    const b: CanvasPoint = { x: 0, y: 0, visible: false };
    for (const [az, el] of [[0, 0.1], [0.8, 0.3], [-0.8, 0.3], [3.1, 0.2], [1.6, 1.4], [-2.4, -0.5]]) {
      r.camera.position.set(target.x + 900 * Math.cos(el) * Math.sin(az), target.y + 900 * Math.sin(el), target.z + 900 * Math.cos(el) * Math.cos(az));
      r.camera.lookAt(target);
      r.camera.updateMatrixWorld();
      frames.forEach((f, i) => {
        projectToCanvas(r.camera, f.center.toArray() as [number, number, number], 800, 600, scratch, a);
        projectToCanvas(r.camera, rings[i].toArray() as [number, number, number], 800, 600, scratch, b);
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-3);
      });
    }
    r.dispose();
  });
});
