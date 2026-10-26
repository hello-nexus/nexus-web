import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LightingDevice } from '../../../../api/lighting';
import type { LightingScene, SceneObject } from '../../../../api/lightingScene';
import { caseObject, deskObject } from '../../../../lib/scene/sceneFixtures';
import { requestOpenBuild } from '../../../../components/views/BuildPage/buildNav';
import LightingScene3D from './LightingScene3D';
import { DEVICE_DRAG_TYPE } from './SceneViewport';
import type { SceneEdit } from './useLightingScene';
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

  describe('placement in the canvas', () => {
    const kase = caseObject();
    const unplaced = () => viewOf([kase], [], [0, 0, 1500]);
    const applied = (api: LightingSceneApi, scene: LightingScene): SceneEdit => {
      const mutate = vi.mocked(api.update).mock.calls[0][0];
      return mutate({ objects: scene.objects, bindings: scene.bindings });
    };

    it('shows no dialog, no experimental editor and no Done flow', async () => {
      await mount(unplaced());
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.queryByText('lighting.scene.title')).toBeNull();
      expect(screen.queryByText('lighting.scene.done')).toBeNull();
      expect(screen.queryByText('lighting.scene.edit')).toBeNull();
    });

    it('lists the devices beside the canvas with where each sits', async () => {
      await mount(viewOf([kase], [{ deviceId: 'argb-1', targets: [{ objectId: kase.id, anchorId: 'strip:front' }], rotation: 0, flip: false }], [0, 0, 1500]));
      expect(screen.getByRole('button', { name: /Corsair M65 PRO/ }).textContent).toContain('lighting.scene.devices.notPlaced');
      expect(screen.getByRole('button', { name: /ARGB_V2_1/ }).textContent).not.toContain('lighting.scene.devices.notPlaced');
    });

    it('click then click: picking a device row and then a spot places it and saves through the hook at once', async () => {
      const scene = unplaced();
      const { api, click, onSelect } = await mount(scene);
      fireEvent.click(screen.getByRole('button', { name: /ARGB_V2_1/ }));
      expect(onSelect).toHaveBeenCalledWith('argb-1');
      expect(api.update).not.toHaveBeenCalled();
      click(400, 225);
      expect(api.update).toHaveBeenCalledTimes(1);
      expect(applied(api, scene).bindings).toEqual([{ deviceId: 'argb-1', targets: [{ objectId: kase.id, anchorId: 'fan:front:120:0' }], rotation: 0, flip: false }]);
    });

    it('a row answers the keyboard like a click', async () => {
      const { onSelect } = await mount(unplaced());
      fireEvent.keyDown(screen.getByRole('button', { name: /ARGB_V2_1/ }), { key: 'Enter' });
      expect(onSelect).toHaveBeenCalledWith('argb-1');
    });

    it('a device already selected in the page and unplaced takes the next spot clicked', async () => {
      const scene = unplaced();
      const { api, click } = await mount(scene, undefined, 'argb-1');
      click(400, 225);
      expect(applied(api, scene).bindings[0].deviceId).toBe('argb-1');
    });

    it('dragging a row onto a spot places the device', async () => {
      const scene = unplaced();
      const { api, container } = await mount(scene);
      const viewport = container.querySelector('canvas')!.closest('[class*="viewport"]') as HTMLElement;
      const dataTransfer = { types: [DEVICE_DRAG_TYPE], getData: (type: string) => (type === DEVICE_DRAG_TYPE ? 'argb-1' : ''), dropEffect: 'none' };
      const at = { clientX: 400, clientY: 225 };
      fireEvent(viewport, Object.assign(new Event('dragover', { bubbles: true, cancelable: true }), { dataTransfer, ...at }));
      fireEvent(viewport, Object.assign(new Event('drop', { bubbles: true, cancelable: true }), { dataTransfer, ...at }));
      expect(api.update).toHaveBeenCalledTimes(1);
      expect(applied(api, scene).bindings[0]).toMatchObject({ deviceId: 'argb-1', targets: [{ objectId: kase.id, anchorId: 'fan:front:120:0' }] });
    });

    it('a drop that misses every spot places nothing', async () => {
      const { api, container } = await mount(unplaced());
      const viewport = container.querySelector('canvas')!.closest('[class*="viewport"]') as HTMLElement;
      const dataTransfer = { types: [DEVICE_DRAG_TYPE], getData: () => 'argb-1', dropEffect: 'none' };
      fireEvent(viewport, Object.assign(new Event('drop', { bubbles: true, cancelable: true }), { dataTransfer, clientX: 2, clientY: 2 }));
      expect(api.update).not.toHaveBeenCalled();
    });

    it('Auto-place binds the devices it recognizes in one update', async () => {
      const scene = unplaced();
      const { api } = await mount(scene, [{ ...device('fan-a', 'Front fan'), iconType: 'fan' } as LightingDevice]);
      fireEvent.click(screen.getByRole('button', { name: 'lighting.scene.devices.autoPlace' }));
      expect(api.update).toHaveBeenCalledTimes(1);
      const next = applied(api, scene);
      expect(next.bindings.map(b => b.deviceId)).toEqual(['fan-a']);
      expect(next.bindings[0].targets[0].anchorId).toMatch(/^fan:/);
    });

    it('Auto-place with nothing it recognizes changes nothing', async () => {
      const { api } = await mount(unplaced(), [device('x', 'Mystery')]);
      fireEvent.click(screen.getByRole('button', { name: 'lighting.scene.devices.autoPlace' }));
      expect(api.update).not.toHaveBeenCalled();
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
