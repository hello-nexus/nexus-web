import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/lightingScene', () => ({
  importLightingScene: vi.fn(),
  putSceneView: vi.fn(),
  fetchLightingScene: vi.fn(),
}));

import { fetchLightingScene, importLightingScene, putSceneView } from '../../../api/lightingScene';
import { relaySceneExport } from './buildScene';

const caseObject = { id: 'case', kind: 'case', source: 'build', position: [0, 0, 0], yaw: 0, size: [230, 470, 450], anchors: [] };
const imported = (camera: unknown) => ({ objects: [caseObject], bindings: [], view: { enabled: false, camera } });

describe('relaySceneExport', () => {
  beforeEach(() => vi.resetAllMocks());

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

  it('reports a refused import', async () => {
    vi.mocked(importLightingScene).mockResolvedValue(null);
    expect(await relaySceneExport({ objects: [caseObject] })).toBe(false);
  });
});
