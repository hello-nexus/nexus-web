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

  it('encodes the model as base64 and turns the view on with a framing camera on first import', async () => {
    vi.mocked(importLightingScene).mockResolvedValue(imported(null) as never);
    vi.mocked(fetchLightingScene).mockResolvedValue(imported(null) as never);
    const model = new Uint8Array([0x67, 0x6c, 0x54, 0x46]).buffer;

    expect(await relaySceneExport({ caseId: 'hyte-y70', objects: [caseObject], model })).toBe(true);

    expect(importLightingScene).toHaveBeenCalledWith({ caseId: 'hyte-y70', objects: [caseObject], modelBase64: 'Z2xURg==' });
    const view = vi.mocked(putSceneView).mock.calls[0][0];
    expect(view.enabled).toBe(true);
    expect(view.camera?.fov).toBeGreaterThan(0);
  });

  it('leaves an existing camera alone on a later import', async () => {
    vi.mocked(importLightingScene).mockResolvedValue(imported({ position: [0, 0, 1], target: [0, 0, 0], fov: 40 }) as never);
    expect(await relaySceneExport({ objects: [caseObject] })).toBe(true);
    expect(putSceneView).not.toHaveBeenCalled();
  });

  it('reports a refused import', async () => {
    vi.mocked(importLightingScene).mockResolvedValue(null);
    expect(await relaySceneExport({ objects: [caseObject] })).toBe(false);
  });
});
