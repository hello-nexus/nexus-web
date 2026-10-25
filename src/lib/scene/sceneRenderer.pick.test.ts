import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  return { objects, bindings, leds: new Map(), selectedDeviceId: null, selectedObjectId: null, placing: false, dropTarget: null, editable: false };
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
});
