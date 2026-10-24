import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LightingDevice } from '../../../../api/lighting';
import type { LightingScene, SceneObject } from '../../../../api/lightingScene';
import { caseObject, deskObject } from '../../../../lib/scene/sceneFixtures';
import LightingScene3D from './LightingScene3D';
import type { LightingSceneApi } from './useLightingScene';

const loop = vi.hoisted(() => ({ frame: null as (() => void) | null }));

vi.mock('three', async importOriginal => {
  const three = await importOriginal<typeof import('three')>();
  class FakeRenderer {
    setClearColor() {}
    setPixelRatio() {}
    setSize() {}
    setAnimationLoop(cb: (() => void) | null) { loop.frame = cb; }
    render(scene: { updateMatrixWorld: (force: boolean) => void }) { scene.updateMatrixWorld(true); }
    dispose() {}
    forceContextLoss() {}
  }
  return { ...three, WebGLRenderer: FakeRenderer };
});
vi.mock('../../../../hooks/useShaderRenderer', () => ({ useShaderRenderer: () => ({ ready: false }) }));
vi.mock('../../../../components/common/DeviceCanvas/DeviceCanvas', () => ({ CanvasBackground: () => null }));
vi.mock('../../../../components/views/BuildPage/buildNav', () => ({ requestOpenBuild: vi.fn() }));

const device = (id: string, name: string) => ({ id, name, ledCount: 10 }) as unknown as LightingDevice;

describe('LightingScene3D click selection', () => {
  beforeEach(() => {
    const ctx = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: '' };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 800, height: 450, right: 800, bottom: 450, x: 0, y: 0, toJSON: () => ({}) });
    Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', { configurable: true, value: 800 });
    Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', { configurable: true, value: 450 });
    HTMLCanvasElement.prototype.setPointerCapture = () => {};
    HTMLCanvasElement.prototype.releasePointerCapture = () => {};
    HTMLCanvasElement.prototype.hasPointerCapture = () => false;
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const mount = async (scene: LightingScene) => {
    const api = {
      scene, setupRev: 1, movable: () => false, moveItem: vi.fn(), turnItem: vi.fn(), model: null, update: vi.fn(),
      setEnabled: vi.fn(), setCamera: vi.fn(() => Promise.resolve()), refreshView: vi.fn(),
    } as unknown as LightingSceneApi;
    const onSelect = vi.fn();
    const { container } = render(
      <LightingScene3D api={api} devices={[device('argb-1', 'ARGB_V2_1'), device('m65', 'Corsair M65 PRO')]} selectedDeviceId={null} onSelectDevice={onSelect}
        shaderEffect={null} shaderState={null} editorOpen={false} onEditorOpenChange={() => {}} />,
    );
    // The first canvas is the shader backdrop; the scene draws into the second.
    await waitFor(() => expect(container.querySelectorAll('canvas').length).toBe(2));
    await waitFor(() => expect(loop.frame).not.toBeNull());
    loop.frame!();
    const click = (x: number, y: number) => {
      const at = { clientX: x, clientY: y, button: 0, pointerId: 1, buttons: 0 };
      const target = container.querySelectorAll('canvas')[1];
      target.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true }), at));
      target.dispatchEvent(Object.assign(new Event('pointerup', { bubbles: true }), at));
    };
    return { onSelect, click };
  };

  const viewOf = (objects: LightingScene['objects'], bindings: LightingScene['bindings'], position: [number, number, number]): LightingScene => ({
    objects, bindings, view: { enabled: true, camera: { position, target: [0, 0, 0], fov: 40 } },
  } as LightingScene);

  it('a click on a bound strip selects its device, even with a free monitor surface in front of it', async () => {
    const kase = caseObject();
    const monitor: SceneObject = {
      id: 'mon-1', kind: 'monitor', label: null, source: 'build', position: [0, 0, 800], yaw: 0, size: [600, 600, 30],
      anchors: [{ id: 'back', kind: 'surface', center: [0, 0, 0], right: [1, 0, 0], up: [0, 1, 0], width: 600, height: 600, shape: 'rect' }],
    };
    const { onSelect, click } = await mount(viewOf([kase, monitor], [{ deviceId: 'argb-1', targets: [{ objectId: kase.id, anchorId: 'strip:front' }], rotation: 0, flip: false }], [0, 0, 1500]));
    click(400, 225);
    expect(onSelect).toHaveBeenCalledWith('argb-1');
  });

  it('a desk mouse whose binding names its old id selects the device; a click on an empty spot selects nothing', async () => {
    const mouse = { ...deskObject('mouse'), id: 'p-mouse-8445a2d5-0' };
    const { onSelect, click } = await mount(viewOf([mouse], [{ deviceId: 'm65', targets: [{ objectId: 'mouse-1', anchorId: 'top' }], rotation: 0, flip: false }], [0, 400, 300]));
    click(5, 5);
    expect(onSelect).not.toHaveBeenCalled();
    click(400, 225);
    expect(onSelect).toHaveBeenCalledWith('m65');
  });
});
