import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Color, Vector3, type Group } from 'three';
import fixture from '../cooling/__fixtures__/y70-case-layout.json';
import { parseCaseLayout, sceneLayout } from '../cooling/caseLayout';
import { buildCase, type Dimmable } from './pcScene';
import { applyHighlight, buildDeskBoxes } from './deskNodes';
import { deskLegBoxes, deskSlabBoxes, placedItemBoxes } from './deskScene';
import { sceneSignature } from './pcSceneSignature';
import type { SceneBinding, SceneObject } from '../../api/lightingScene';
import { caseObject, deskObject } from './sceneFixtures';
import { deviceForPick, deviceForStack } from './pickDevice';
import { SceneRenderer, type ScenePick, type SceneRenderState } from './sceneRenderer';

vi.mock('three', async importOriginal => {
  const three = await importOriginal<typeof import('three')>();
  class FakeRenderer {
    setClearColor() {}
    setPixelRatio() {}
    setSize() {}
    setAnimationLoop() {}
    render() {}
    dispose() {}
    forceContextLoss() {}
  }
  return { ...three, WebGLRenderer: FakeRenderer };
});

const theme = { accent: '#4da3ff', line: '#e6e9ee', face: '#8b95a5', desk: '#1b1f26' };
const bind = (deviceId: string, objectId: string, anchorId: string): SceneBinding => ({ deviceId, targets: [{ objectId, anchorId }], rotation: 0, flip: false });

// The render loop refreshes world matrices before every frame; a test has no loop.
const settle = (r: SceneRenderer) => (r as unknown as { scene: { updateMatrixWorld: (force: boolean) => void } }).scene.updateMatrixWorld(true);

function stateOf(objects: SceneObject[], bindings: SceneBinding[]): SceneRenderState {
  return { objects, bindings, leds: new Map(), selectedDeviceId: null, selectedObjectId: null, editable: false };
}

describe('scene pick path', () => {
  let canvas: HTMLCanvasElement;
  let picks: Array<ScenePick | null>;
  let stacks: ScenePick[][];
  let renderer: SceneRenderer;

  beforeEach(() => {
    const ctx = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: '' };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'clientWidth', { value: 800 });
    Object.defineProperty(canvas, 'clientHeight', { value: 450 });
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 450, right: 800, bottom: 450, x: 0, y: 0, toJSON: () => ({}) });
    canvas.setPointerCapture = () => {};
    canvas.hasPointerCapture = () => false;
    canvas.releasePointerCapture = () => {};
    document.body.appendChild(canvas);
    picks = [];
    stacks = [];
    renderer = new SceneRenderer(canvas, { onCamera: () => {}, onPick: (p, stack) => { picks.push(p); stacks.push(stack); }, onMoveObject: () => {} }, theme);
  });

  afterEach(() => {
    renderer?.dispose();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('a click on a case strip reaches onPick and names the bound device', () => {
    const kase = caseObject();
    const bindings = [bind('argb-1', kase.id, 'strip:front')];
    renderer.setState(stateOf([kase], bindings));
    renderer.setCamera({ position: [0, 0, 1500], target: [0, 0, 0], fov: 40 });
    settle(renderer);
    const at = { clientX: 400, clientY: 225, button: 0, pointerId: 1 };
    canvas.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true }), at));
    canvas.dispatchEvent(Object.assign(new Event('pointerup', { bubbles: true }), at));
    expect(picks.length).toBe(1);
    expect(deviceForStack(bindings, stacks[0])).toBe('argb-1');
  });

  it('a desk mouse with a binding is picked by its surface', () => {
    const mouse = deskObject('mouse');
    renderer.setState(stateOf([mouse], [bind('m65', mouse.id, 'top')]));
    renderer.setCamera({ position: [0, 400, 300], target: [0, 20, 0], fov: 40 });
    settle(renderer);
    expect(renderer.pickAt(400, 225)).toEqual({ kind: 'anchor', objectId: mouse.id, anchorId: 'top' });
  });

  it('a free monitor surface in front of the case strip is listed before it but does not hide the strip', () => {
    const kase = caseObject();
    const monitor: SceneObject = {
      id: 'mon-1', kind: 'monitor', label: null, source: 'build', position: [0, 0, 800], yaw: 0, size: [600, 600, 30],
      anchors: [{ id: 'back', kind: 'surface', center: [0, 0, 0], right: [1, 0, 0], up: [0, 1, 0], width: 600, height: 600, shape: 'rect' }],
    };
    const bindings = [bind('argb-1', kase.id, 'strip:front')];
    renderer.setState(stateOf([kase, monitor], bindings));
    renderer.setCamera({ position: [0, 0, 1500], target: [0, 0, 0], fov: 40 });
    settle(renderer);
    const stack = renderer.pickStackAt(400, 225);
    const at = (objectId: string) => stack.findIndex(p => p.kind === 'anchor' && p.objectId === objectId);
    expect(at('mon-1')).toBeGreaterThanOrEqual(0);
    expect(at('mon-1')).toBeLessThan(at(kase.id));
    expect(deviceForPick(bindings, renderer.pickAt(400, 225))).toBeNull();
    expect(deviceForStack(bindings, stack)).toBe('argb-1');
  });

  describe('the case drawn by Build\'s scene code', () => {
    const layout = parseCaseLayout(fixture)!;
    const caseScene = { layout: sceneLayout(layout), windowRight: false };
    const groupOf = (id: string) => (renderer as unknown as { objectGroups: Map<string, Group> }).objectGroups.get(id)!;

    it('is the very scene buildCase makes for the layout, carried into the case object\'s frame', () => {
      const kase = caseObject();
      renderer.setCaseScene(caseScene);
      renderer.setState(stateOf([kase], []));
      const toScene = groupOf(kase.id).children[0];
      const palette = { part: new Color(theme.accent), frame: new Color(theme.face), bad: new Color('#ef4444'), limit: new Color('#f59e0b') };
      const expected = buildCase(caseScene.layout, palette, [], [], [], true, false, true, true);
      expect(sceneSignature(toScene.children[0].children[0])).toEqual(sceneSignature(expected));
      // The layout's own corner lands where Build's export puts it: x = z - W/2, z = D/2 - x.
      const [D, W] = layout.size;
      const corner = new Vector3(0, 0, 0).applyMatrix4(toScene.matrix);
      expect([corner.x, corner.y, corner.z].map(Math.round)).toEqual([-W / 2, 0, D / 2].map(Math.round));
    });

    it('mirrors x for a window on the right', () => {
      const kase = caseObject();
      renderer.setCaseScene({ ...caseScene, windowRight: true });
      renderer.setState(stateOf([kase], []));
      const [, W] = layout.size;
      const corner = new Vector3(0, 0, 0).applyMatrix4(groupOf(kase.id).children[0].matrix);
      expect(Math.round(corner.x)).toBe(Math.round(W / 2));
    });

    it('keeps the anchors pickable and the case grabbable on its bounds', () => {
      const kase = caseObject();
      const bindings = [bind('argb-1', kase.id, 'strip:front')];
      renderer.setCaseScene(caseScene);
      renderer.setState(stateOf([kase], bindings));
      renderer.setCamera({ position: [0, 0, 1500], target: [0, 0, 0], fov: 40 });
      settle(renderer);
      expect(deviceForStack(bindings, renderer.pickStackAt(400, 225))).toBe('argb-1');
    });

    it('draws no scene of its own for a case when there is no layout', () => {
      const kase = caseObject();
      renderer.setCaseScene(null);
      renderer.setState(stateOf([kase], []));
      expect(groupOf(kase.id).children.some(c => c.matrixAutoUpdate === false)).toBe(false);
    });
  });
  describe('the desk drawn by Build\'s scene code', () => {
    const groupOf = (id: string) => (renderer as unknown as { objectGroups: Map<string, Group> }).objectGroups.get(id)!;
    const palette = { part: new Color(theme.accent), frame: new Color(theme.face), bad: new Color('#ef4444'), limit: new Color('#f59e0b') };
    // Geometry, draw order and every material parameter, the opacities and colors included, match the shared module's own.
    const shape = (o: Group) => sceneSignature(o);
    const monitor = (): SceneObject => ({ id: 'mon-1', kind: 'monitor', label: null, source: 'build', position: [0, 0, 0], yaw: 0, size: [620, 450, 50], anchors: [] });

    it('draws a plain item as the very box the desk scene makes for it', () => {
      const keyboard = deskObject('keyboard');
      renderer.setState(stateOf([keyboard], []));
      const expected = buildDeskBoxes(placedItemBoxes({ id: keyboard.id, kind: 'keyboard', cx: 0, cz: 0, minY: 0, yaw: 0, size: keyboard.size }), palette, [], [], []);
      expect(shape(groupOf(keyboard.id).children[0])).toEqual(shape(expected));
    });

    it('stands every monitor on its foot and neck, the very boxes the layout makes', () => {
      renderer.setState(stateOf([monitor()], []));
      const expected = buildDeskBoxes(placedItemBoxes({ id: 'mon-1', kind: 'monitor', cx: 0, cz: 0, minY: 0, yaw: 0, size: [620, 450, 50] }), palette, [], [], []);
      expect(expected.children).toHaveLength(3);
      expect(shape(groupOf('mon-1').children[0])).toEqual(shape(expected));
    });

    it('tints the selected item exactly as Build\'s desk view does and leaves the rest', () => {
      const keyboard = deskObject('keyboard');
      const mouse = deskObject('mouse');
      renderer.setState({ ...stateOf([keyboard, mouse], []), selectedObjectId: keyboard.id });
      const dimmables: Dimmable[] = [];
      const expected = buildDeskBoxes([...placedItemBoxes({ id: keyboard.id, kind: 'keyboard', cx: 0, cz: 0, minY: 0, yaw: 0, size: keyboard.size }), ...placedItemBoxes({ id: mouse.id, kind: 'mouse', cx: 0, cz: 0, minY: 0, yaw: 0, size: mouse.size })], palette, [], [], dimmables);
      applyHighlight(dimmables, keyboard.id, 'tint');
      expect(shape(groupOf(keyboard.id).children[0].children[0] as Group)).toEqual(shape(expected.children[0] as Group));
      expect(shape(groupOf(mouse.id).children[0].children[0] as Group)).toEqual(shape(expected.children[1] as Group));
    });

    it('draws a curved monitor through the shared curved panel', () => {
      renderer.setState(stateOf([{ ...monitor(), curve: { radiusMm: 1800 } }], []));
      const expected = buildDeskBoxes(placedItemBoxes({ id: 'mon-1', kind: 'monitor', cx: 0, cz: 0, minY: 0, yaw: 0, size: [620, 450, 50], curveRadius: 1800 }), palette, [], [], []);
      expect(shape(groupOf('mon-1').children[0])).toEqual(shape(expected));
      const flat = buildDeskBoxes(placedItemBoxes({ id: 'mon-1', kind: 'monitor', cx: 0, cz: 0, minY: 0, yaw: 0, size: [620, 450, 50] }), palette, [], [], []);
      expect(shape(expected)).not.toEqual(shape(flat));
    });

    it('draws a desk object with its slab and four legs, picked as that object', () => {
      const desk: SceneObject = { id: 'desk-1', kind: 'desk', label: null, source: 'build', position: [0, 0, 0], yaw: 0, size: [1600, 30, 800], anchors: [] };
      renderer.setState(stateOf([desk], []));
      const expected = buildDeskBoxes([...deskSlabBoxes({ x0: -800, x1: 800, z0: -400, z1: 400 }), ...deskLegBoxes({ x0: -800, x1: 800, z0: -400, z1: 400 })], palette, [], [], []);
      expect(groupOf(desk.id).children[0].children).toHaveLength(expected.children.length);
      renderer.setCamera({ position: [0, 900, 1400], target: [0, 0, 0], fov: 40 });
      settle(renderer);
      expect(renderer.pickAt(400, 330)).toEqual({ kind: 'object', objectId: desk.id });
    });

    it('draws an L desk as one set of legs on the main object and the far slab on the return', () => {
      const main: SceneObject = { id: 'desk-1', kind: 'desk', label: null, source: 'build', position: [0, 0, 0], yaw: 0, size: [1400, 30, 700], anchors: [] };
      const ret: SceneObject = { id: 'desk-1.return', kind: 'desk', label: null, source: 'build', position: [400, 0, 400], yaw: 0, size: [600, 30, 1500], anchors: [] };
      renderer.setState(stateOf([main, ret], []));
      const faces = (o: SceneObject) => groupOf(o.id).children[0].children.length;
      expect(faces(main)).toBe(1 + 6);
      expect(faces(ret)).toBe(1);
    });
  });
});
