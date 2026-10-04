import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/lightingScene', () => ({
  importLightingScene: vi.fn(),
  putLightingScene: vi.fn(),
  putSceneView: vi.fn(),
  fetchLightingScene: vi.fn(),
}));
vi.mock('../../../api/lighting', () => ({ fetchLightingDevices: vi.fn() }));

import { fetchLightingDevices } from '../../../api/lighting';
import { fetchLightingScene, importLightingScene, putLightingScene, putSceneView } from '../../../api/lightingScene';
import { relaySceneExport, scenePlacements } from './buildScene';

const caseObject = { id: 'case', kind: 'case', source: 'build', position: [0, 0, 0], yaw: 0, size: [230, 470, 450], anchors: [] };
const imported = (camera: unknown) => ({ objects: [caseObject], bindings: [], view: { enabled: false, camera } });

describe('relaySceneExport', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fetchLightingDevices).mockResolvedValue(null);
  });

  it('refuses a message with no objects or too many', async () => {
    expect(await relaySceneExport({ objects: [] })).toBe(false);
    expect(await relaySceneExport({ objects: Array.from({ length: 65 }, () => caseObject) })).toBe(false);
    expect(await relaySceneExport({ objects: 'nope' })).toBe(false);
    expect(importLightingScene).not.toHaveBeenCalled();
  });

  it('passes the shapes on and turns the view on with a framing camera on first import', async () => {
    vi.mocked(importLightingScene).mockResolvedValue(imported(null) as never);
    vi.mocked(fetchLightingScene).mockResolvedValue(imported(null) as never);
    const model = { version: 1, shapes: { case: { size: [450, 230, 470], boxes: [], lines: [] } } };

    expect(await relaySceneExport({ caseId: 'hyte-y70', objects: [caseObject], model })).toBe(true);

    expect(importLightingScene).toHaveBeenCalledWith({ caseId: 'hyte-y70', objects: [caseObject], model });
    const view = vi.mocked(putSceneView).mock.calls[0][0];
    expect(view.enabled).toBe(true);
    expect(view.camera?.fov).toBeGreaterThan(0);
  });

  it('leaves an existing camera alone on a later import', async () => {
    vi.mocked(importLightingScene).mockResolvedValue(imported({ position: [0, 0, 1], target: [0, 0, 0], fov: 40 }) as never);
    expect(await relaySceneExport({ objects: [caseObject] })).toBe(true);
    expect(putSceneView).not.toHaveBeenCalled();
  });

  it('drops a model that is not an object', async () => {
    vi.mocked(importLightingScene).mockResolvedValue(imported({ position: [0, 0, 1], target: [0, 0, 0], fov: 40 }) as never);
    await relaySceneExport({ objects: [caseObject], model: [1, 2] });
    expect(importLightingScene).toHaveBeenCalledWith({ caseId: null, objects: [caseObject], model: null });
  });

  it('places a device whose spot is certain right after the import', async () => {
    const keyboard = { id: 'keyboard', kind: 'keyboard', source: 'build', position: [0, 0, 190], yaw: 0, size: [360, 40, 140],
      anchors: [{ id: 'top', kind: 'surface', center: [0, 40, 0], right: [1, 0, 0], up: [0, 0, -1], width: 360, height: 140, shape: 'rect' }] };
    vi.mocked(importLightingScene).mockResolvedValue({ ...imported({ position: [0, 0, 1], target: [0, 0, 0], fov: 40 }), objects: [caseObject, keyboard] } as never);
    vi.mocked(fetchLightingDevices).mockResolvedValue({ isInit: true, devices: [
      { id: 'keeb', name: 'HYTE Keeb TKL - Keys', type: 'ledstrip', iconType: 'keyboard', ledsOn: true, ledCount: 147, canvasX: 0, canvasY: 0, canvasW: 1, canvasH: 1, canvasRotation: 0 },
    ] } as never);
    expect(await relaySceneExport({ objects: [caseObject, keyboard] })).toBe(true);
    expect(putLightingScene).toHaveBeenCalledWith({ objects: [caseObject, keyboard], bindings: [{ deviceId: 'keeb', targets: [{ objectId: 'keyboard', anchorId: 'top' }], rotation: 0, flip: false }] });
  });

  it('lists where each Build object stands, for the frame', () => {
    expect(scenePlacements({ objects: [caseObject, { ...caseObject, id: 'mine', source: 'user' }] } as never)).toEqual({ case: { position: [0, 0, 0], yaw: 0 } });
    expect(scenePlacements(null)).toEqual({});
  });

  it('reports a refused import', async () => {
    vi.mocked(importLightingScene).mockResolvedValue(null);
    expect(await relaySceneExport({ objects: [caseObject] })).toBe(false);
  });
});
