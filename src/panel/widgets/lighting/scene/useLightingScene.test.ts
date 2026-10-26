import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../api/lightingScene', () => ({
  fetchLightingScene: vi.fn(),
  fetchSceneModel: vi.fn(),
  putLightingScene: vi.fn(),
  putSceneView: vi.fn(),
}));
vi.mock('../../../../api/pcSetup', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/pcSetup')>('../../../../api/pcSetup');
  return { ...actual, fetchPcSetup: vi.fn() };
});
vi.mock('../../../../api/lighting', () => ({ fetchLedMap: vi.fn() }));

import { fetchLightingScene, putLightingScene, putSceneView, type LightingScene } from '../../../../api/lightingScene';
import { fetchPcSetup, type PcSetup, type PcSetupRecord } from '../../../../api/pcSetup';
import type { SceneObject } from '../../../../api/lightingScene';
import { useLightingScene } from './useLightingScene';

const cam = (x: number) => ({ position: [x, 0, 1000] as [number, number, number], target: [0, 0, 0] as [number, number, number], fov: 40 });
const baseScene = (): LightingScene => ({ objects: [], bindings: [], view: { enabled: true, camera: cam(0) }, modelRev: null, caseId: null });

async function mounted() {
  const hook = renderHook(() => useLightingScene(true));
  await waitFor(() => expect(hook.result.current.scene).not.toBeNull());
  return hook;
}

const obj = (id: string, kind: string, x: number, z: number, yaw = 0): SceneObject => ({
  id, kind, source: 'build', position: [x, 5, z], yaw, size: [100, 10, 100], anchors: [],
});
const emptySetup = (): PcSetup => ({ version: 1, case: {}, items: [], resolved: { objects: [] } });
const record = (rev: number, objects: SceneObject[], itemIds: string[]): PcSetupRecord => ({
  rev,
  setup: { ...emptySetup(), items: itemIds.map(id => ({ id, kind: 'keyboard', owned: true })), resolved: { objects } },
});

describe('useLightingScene', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fetchLightingScene).mockResolvedValue(baseScene());
    vi.mocked(putLightingScene).mockResolvedValue(baseScene());
    vi.mocked(fetchPcSetup).mockResolvedValue({ rev: 0, setup: emptySetup() });
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
    const calls = vi.mocked(putSceneView).mock.calls.map(c => c[0]);
    expect(calls[1].seq!).toBeGreaterThan(calls[0].seq!);
    expect(calls[0].session).toBeTruthy();
    expect(calls[1].session).toBe(calls[0].session);
  });

  it('keeps a pending local edit when a refresh arrives, taking only the view', async () => {
    const { result } = await mounted();
    act(() => { result.current.update(s => ({ ...s, bindings: [{ deviceId: 'kb', targets: [{ objectId: 'o', anchorId: 'a' }], rotation: 0, flip: false }] })); });
    vi.mocked(fetchLightingScene).mockResolvedValue({ ...baseScene(), view: { enabled: false, camera: cam(5) } });

    await act(async () => { await result.current.refreshView(); });

    expect(result.current.scene!.bindings.map(b => b.deviceId)).toEqual(['kb']);
    expect(result.current.scene!.view.enabled).toBe(false);
  });

  it('never lets a refresh put the old camera back while a camera save is on the wire', async () => {
    let answer: () => void = () => {};
    vi.mocked(putSceneView).mockImplementation(() => new Promise(resolve => { answer = () => resolve(baseScene().view); }));
    const { result } = await mounted();
    act(() => { void result.current.setCamera(cam(300), true); });
    await waitFor(() => expect(putSceneView).toHaveBeenCalled());

    await act(async () => { await result.current.refreshView(); });
    expect(result.current.scene!.view.camera!.position[0]).toBe(300);

    await act(async () => { answer(); });
  });

  it('keeps the same arrays when a refresh brings nothing new, so the renderer does not rebuild', async () => {
    const { result } = await mounted();
    const before = result.current.scene!;
    await act(async () => { await result.current.refreshView(); });
    expect(result.current.scene!.objects).toBe(before.objects);
    expect(result.current.scene!.bindings).toBe(before.bindings);
    expect(result.current.scene!.view).toBe(before.view);
  });

  it('sends a still-pending edit when the page unmounts instead of dropping it', async () => {
    const hook = await mounted();
    act(() => { hook.result.current.update(s => ({ ...s, bindings: [{ deviceId: 'd', targets: [{ objectId: 'o', anchorId: 'a' }], rotation: 0, flip: false }] })); });
    hook.unmount();
    expect(putLightingScene).toHaveBeenCalledWith(expect.objectContaining({ bindings: [expect.objectContaining({ deviceId: 'd' })] }));
  });

  it('saves a placement by itself after a short quiet spell, with no confirm step', async () => {
    const { result } = await mounted();
    act(() => { result.current.update(s => ({ ...s, bindings: [{ deviceId: 'd', targets: [{ objectId: 'o', anchorId: 'a' }], rotation: 0, flip: false }] })); });
    expect(putLightingScene).not.toHaveBeenCalled();
    await waitFor(() => expect(putLightingScene).toHaveBeenCalledTimes(1));
    expect(vi.mocked(putLightingScene).mock.calls[0][0].bindings).toEqual([expect.objectContaining({ deviceId: 'd' })]);
  });

  it('puts the switch back when turning the view on fails', async () => {
    vi.mocked(fetchLightingScene).mockResolvedValue({ ...baseScene(), view: { enabled: false, camera: cam(0) } });
    vi.mocked(putSceneView).mockResolvedValue(null);
    const { result } = await mounted();

    await act(async () => { await result.current.setEnabled(true); });

    expect(result.current.scene!.view.enabled).toBe(false);
  });
  describe('shared PC setup', () => {
    const kb = obj('kb-1', 'keyboard', 10, 20);
    const pc = obj('case-x', 'case', 0, 0, 90);
    const withRecord = (rev: number, objects: SceneObject[], ids: string[]) => {
      vi.mocked(fetchLightingScene).mockResolvedValue({ ...baseScene(), objects });
      vi.mocked(fetchPcSetup).mockResolvedValue(record(rev, objects, ids));
    };

    it('sends bindings only once a record owns the objects, and keeps hand-placed objects riding along before one', async () => {
      withRecord(2, [pc, kb], ['kb-1']);
      const owned = await mounted();
      act(() => { owned.result.current.update(s => ({ ...s, bindings: [{ deviceId: 'd', targets: [{ objectId: 'kb-1', anchorId: 'top' }], rotation: 0, flip: false }] })); });
      owned.unmount();
      expect(putLightingScene).toHaveBeenLastCalledWith({ bindings: [expect.objectContaining({ deviceId: 'd' })] });

      vi.mocked(fetchPcSetup).mockResolvedValue({ rev: 0, setup: emptySetup() });
      vi.mocked(fetchLightingScene).mockResolvedValue({ ...baseScene(), objects: [kb] });
      const legacy = await mounted();
      act(() => { legacy.result.current.update(s => ({ ...s, bindings: [{ deviceId: 'd', targets: [{ objectId: 'kb-1', anchorId: 'top' }], rotation: 0, flip: false }] })); });
      legacy.unmount();
      expect(putLightingScene).toHaveBeenLastCalledWith(expect.objectContaining({ objects: [kb] }));
    });
  });

  describe('a binding left on a gone object id', () => {
    const withTop = (id: string, kind: string): SceneObject => ({ ...obj(id, kind, 0, 0), anchors: [{ id: 'top', kind: 'surface', center: [0, 0, 0], right: [1, 0, 0], up: [0, 1, 0], width: 1, height: 1, shape: 'rect' }] });
    const bound = (objectId: string) => ({ deviceId: 'dev', targets: [{ objectId, anchorId: 'top' }], rotation: 0, flip: false });

    it('reads healed, writes nothing by itself, and a later edit saves the healed bindings', async () => {
      vi.mocked(fetchLightingScene).mockResolvedValue({ ...baseScene(), objects: [withTop('p-mouse-1', 'mouse')], bindings: [bound('mouse-1')] });
      const { result } = await mounted();
      expect(result.current.scene!.bindings[0].targets[0].objectId).toBe('p-mouse-1');
      await new Promise(resolve => { setTimeout(resolve, 400); });
      expect(putLightingScene).not.toHaveBeenCalled();
      act(() => { result.current.update(s => ({ ...s, bindings: [...s.bindings, { deviceId: 'other', targets: [], rotation: 0, flip: false }] })); });
      await waitFor(() => expect(putLightingScene).toHaveBeenCalledTimes(1));
      expect(vi.mocked(putLightingScene).mock.calls[0][0].bindings![0].targets[0].objectId).toBe('p-mouse-1');
    });

    it('stays as it is when two objects share the kind', async () => {
      vi.mocked(fetchLightingScene).mockResolvedValue({ ...baseScene(), objects: [withTop('kb-a', 'keyboard'), withTop('kb-b', 'keyboard')], bindings: [bound('keyboard-1')] });
      const { result } = await mounted();
      expect(result.current.scene!.bindings[0].targets[0].objectId).toBe('keyboard-1');
    });

    it('is untouched when its object exists', async () => {
      const scene = { ...baseScene(), objects: [withTop('p-mouse-1', 'mouse')], bindings: [bound('p-mouse-1')] };
      vi.mocked(fetchLightingScene).mockResolvedValue(scene);
      const { result } = await mounted();
      expect(result.current.scene!.bindings).toEqual(scene.bindings);
      expect(putLightingScene).not.toHaveBeenCalled();
    });
  });
});
