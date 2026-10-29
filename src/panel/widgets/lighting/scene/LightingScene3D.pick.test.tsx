import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LightingDevice } from '../../../../api/lighting';
import type { LightingScene, SceneObject } from '../../../../api/lightingScene';
import { caseObject, deskObject } from '../../../../lib/scene/sceneFixtures';
import { requestOpenBuild } from '../../../../components/views/BuildPage/buildNav';
import LightingScene3D from './LightingScene3D';
import type { LightingSceneApi } from './useLightingScene';

const loop = vi.hoisted(() => ({ frame: null as (() => void) | null }));

vi.mock('three', async importOriginal => {
  const three = await importOriginal<typeof import('three')>();
  class FakeRenderer {
    setClearColor() {}
    setPixelRatio() {}
    setSize() {}
    setAnimationLoop(cb: (() => void) | null) { if (cb) loop.frame = cb; }
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

describe('LightingScene3D inline scene', () => {
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

  const mount = async (scene: LightingScene, devices = [device('argb-1', 'ARGB_V2_1'), device('m65', 'Corsair M65 PRO')], selectedDeviceId: string | null = null) => {
    const api = {
      scene, model: null, update: vi.fn(),
      setEnabled: vi.fn(), setCamera: vi.fn(() => Promise.resolve()), refreshView: vi.fn(),
    } as unknown as LightingSceneApi;
    const onSelect = vi.fn();
    const { container } = render(
      <LightingScene3D api={api} devices={devices} selectedDeviceId={selectedDeviceId} onSelectDevice={onSelect}
        shaderEffect={null} shaderState={null} />,
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
    return { onSelect, click, api, container };
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

  it('a bound desk mouse selects its device; a click on an empty spot selects nothing', async () => {
    const mouse = { ...deskObject('mouse'), id: 'p-mouse-8445a2d5-0' };
    const { onSelect, click } = await mount(viewOf([mouse], [{ deviceId: 'm65', targets: [{ objectId: mouse.id, anchorId: 'top' }], rotation: 0, flip: false }], [0, 400, 300]));
    click(5, 5);
    expect(onSelect).not.toHaveBeenCalled();
    click(400, 225);
    expect(onSelect).toHaveBeenCalledWith('m65');
  });

  describe('read-only scene', () => {
    const kase = caseObject();
    const unplaced = () => viewOf([kase], [], [0, 0, 1500]);

    it('shows no dialog and no device list, auto-place or placement hint', async () => {
      await mount(unplaced());
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.queryByText('lighting.scene.devices.title')).toBeNull();
      expect(screen.queryByRole('button', { name: 'lighting.scene.devices.autoPlace' })).toBeNull();
      expect(screen.queryByRole('button', { name: /ARGB_V2_1/ })).toBeNull();
      expect(screen.queryByText('lighting.scene.devices.note')).toBeNull();
    });

    it('a click on a free spot never writes a placement, even with an unplaced device selected', async () => {
      const { api, click } = await mount(unplaced(), undefined, 'argb-1');
      click(400, 225);
      expect(api.update).not.toHaveBeenCalled();
    });

    it('a bound device offers Identify but no move, turn, flip or remove', async () => {
      const bound = viewOf([kase], [{ deviceId: 'argb-1', targets: [{ objectId: kase.id, anchorId: 'strip:front' }], rotation: 0, flip: false }], [0, 0, 1500]);
      const api = {
        scene: bound, model: null, update: vi.fn(), setEnabled: vi.fn(), setCamera: vi.fn(() => Promise.resolve()), refreshView: vi.fn(),
      } as unknown as LightingSceneApi;
      render(<LightingScene3D api={api} devices={[device('argb-1', 'ARGB_V2_1')]} selectedDeviceId="argb-1" onSelectDevice={vi.fn()}
        shaderEffect={null} shaderState={null} onIdentify={vi.fn()} />);
      expect(await screen.findByRole('button', { name: 'lighting.scene.device.identify' })).toBeTruthy();
      for (const key of ['move', 'rotate', 'flip', 'unplace', 'addSurface']) {
        expect(screen.queryByText(`lighting.scene.device.${key}`)).toBeNull();
      }
    });
  });

  describe('PC items', () => {
    it('Edit in Build opens Build, and there is no control to move or turn the case or desk items', async () => {
      const kase = caseObject();
      await mount(viewOf([kase], [], [0, 0, 1500]));
      fireEvent.click(screen.getByRole('button', { name: 'lighting.scene.pc.update' }));
      expect(requestOpenBuild).toHaveBeenCalledWith('/builder');
      expect(screen.queryByText('lighting.scene.object.turnLeft')).toBeNull();
      expect(screen.queryByText('lighting.scene.object.turnRight')).toBeNull();
    });

    it('a click on a case or desk object selects no device and offers no move or turn', async () => {
      const kase = caseObject();
      const { onSelect, click } = await mount(viewOf([kase], [], [0, 0, 1500]));
      click(5, 5);
      expect(onSelect).not.toHaveBeenCalled();
      expect(screen.queryByText('lighting.scene.object.turnLeft')).toBeNull();
    });
  });
});
