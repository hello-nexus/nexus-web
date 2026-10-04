import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../api/lightingScene', () => ({
  fetchLightingScene: vi.fn(),
  fetchSceneModel: vi.fn(),
  putLightingScene: vi.fn(),
  putSceneView: vi.fn(),
  deleteSceneImport: vi.fn(),
}));
vi.mock('../../../../api/lighting', () => ({ fetchLedMap: vi.fn() }));

import { fetchLightingScene, putLightingScene, putSceneView, type LightingScene } from '../../../../api/lightingScene';
import { useLightingScene } from './useLightingScene';

const cam = (x: number) => ({ position: [x, 0, 1000] as [number, number, number], target: [0, 0, 0] as [number, number, number], fov: 40 });
const baseScene = (): LightingScene => ({ objects: [], bindings: [], view: { enabled: true, camera: cam(0) }, modelRev: null, caseId: null });

async function mounted() {
  const hook = renderHook(() => useLightingScene(true));
  await waitFor(() => expect(hook.result.current.scene).not.toBeNull());
  return hook;
}

describe('useLightingScene', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fetchLightingScene).mockResolvedValue(baseScene());
    vi.mocked(putLightingScene).mockResolvedValue(baseScene());
  });

  it('sends view requests one at a time with rising sequence numbers, the commit after its drafts', async () => {
    const order: string[] = [];
    let releaseDraft: () => void = () => {};
    vi.mocked(putSceneView).mockImplementation(body => {
      order.push(body.draft ? 'draft' : 'commit');
      if (body.draft) return new Promise(resolve => { releaseDraft = () => resolve(baseScene().view); });
      return Promise.resolve(baseScene().view);
    });
    const { result } = await mounted();

    act(() => { void result.current.setCamera(cam(100), false); });
    await waitFor(() => expect(order).toEqual(['draft']));
    let committed = false;
    act(() => { void result.current.setCamera(cam(200), true).then(() => { committed = true; }); });
    // The commit waits for the draft still on the wire.
    expect(order).toEqual(['draft']);
    await act(async () => { releaseDraft(); });
    await waitFor(() => expect(committed).toBe(true));
    expect(order).toEqual(['draft', 'commit']);
    const seqs = vi.mocked(putSceneView).mock.calls.map(c => c[0].seq!);
    expect(seqs[1]).toBeGreaterThan(seqs[0]);
  });

  it('keeps a pending local edit when a refresh arrives, taking only the view', async () => {
    const { result } = await mounted();
    act(() => { result.current.update(s => ({ ...s, objects: [{ id: 'kb', kind: 'keyboard', source: 'user', position: [0, 0, 0], yaw: 0, size: [1, 1, 1], anchors: [] }] })); });
    vi.mocked(fetchLightingScene).mockResolvedValue({ ...baseScene(), view: { enabled: false, camera: cam(5) } });

    await act(async () => { await result.current.refreshView(); });

    expect(result.current.scene!.objects.map(o => o.id)).toEqual(['kb']);
    expect(result.current.scene!.view.enabled).toBe(false);
  });

  it('sends a still-pending edit when the page unmounts instead of dropping it', async () => {
    const hook = await mounted();
    act(() => { hook.result.current.update(s => ({ ...s, bindings: [{ deviceId: 'd', targets: [{ objectId: 'o', anchorId: 'a' }], rotation: 0, flip: false }] })); });
    hook.unmount();
    expect(putLightingScene).toHaveBeenCalledWith(expect.objectContaining({ bindings: [expect.objectContaining({ deviceId: 'd' })] }));
  });

  it('puts the switch back when turning the view on fails', async () => {
    vi.mocked(fetchLightingScene).mockResolvedValue({ ...baseScene(), view: { enabled: false, camera: cam(0) } });
    vi.mocked(putSceneView).mockResolvedValue(null);
    const { result } = await mounted();

    await act(async () => { await result.current.setEnabled(true); });

    expect(result.current.scene!.view.enabled).toBe(false);
  });
});
