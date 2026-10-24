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
  return { ...actual, fetchPcSetup: vi.fn(), patchPcSetupPlacements: vi.fn() };
});
vi.mock('../../../../api/lighting', () => ({ fetchLedMap: vi.fn() }));

import { fetchLightingScene, putLightingScene, putSceneView, type LightingScene } from '../../../../api/lightingScene';
import { fetchPcSetup, patchPcSetupPlacements, type PcSetup, type PcSetupRecord } from '../../../../api/pcSetup';
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

    it('moves an item through the placements route with places only, and shows the moved pose', async () => {
      withRecord(3, [pc, kb], ['kb-1']);
      vi.mocked(patchPcSetupPlacements).mockResolvedValue({ kind: 'saved', rev: 4 });
      const { result } = await mounted();
      await waitFor(() => expect(result.current.setupRev).toBe(3));
      expect(result.current.movable('kb-1')).toBe(true);

      act(() => { result.current.moveItem('kb-1', [100, 5, 200]); });
      await waitFor(() => expect(patchPcSetupPlacements).toHaveBeenCalledTimes(1));

      const call = vi.mocked(patchPcSetupPlacements).mock.calls[0];
      expect(call).toHaveLength(2);
      expect(call[0]).toBe(3);
      expect(call[1]).toEqual([{ id: 'kb-1', x: 100, z: 200, yaw: 0 }]);
      expect(result.current.scene!.objects).toEqual([pc, { ...kb, position: [100, 5, 200] }]);
      await waitFor(() => expect(result.current.setupRev).toBe(4));
    });

    it('never moves the desk or its return wing', async () => {
      const desk = obj('desk-1', 'desk', 0, 0);
      const wing = obj('desk-1.return', 'desk', 1000, 0);
      withRecord(2, [desk, wing, kb], ['desk-1', 'kb-1']);
      const { result } = await mounted();
      await waitFor(() => expect(result.current.setupRev).toBe(2));
      expect(result.current.movable('desk-1')).toBe(false);
      expect(result.current.movable('desk-1.return')).toBe(false);
      expect(result.current.movable('kb-1')).toBe(true);

      act(() => { result.current.moveItem('desk-1', [50, 5, -20]); result.current.turnItem('desk-1', 15); });
      expect(result.current.scene!.objects.find(o => o.id === 'desk-1')!.position).toEqual([0, 5, 0]);
      expect(patchPcSetupPlacements).not.toHaveBeenCalled();
    });

    it('addresses the case as case and turns it', async () => {
      withRecord(1, [pc, kb], ['kb-1']);
      vi.mocked(patchPcSetupPlacements).mockResolvedValue({ kind: 'saved', rev: 2 });
      const { result } = await mounted();
      await waitFor(() => expect(result.current.movable('case-x')).toBe(true));
      act(() => { result.current.turnItem('case-x', 15); });
      await waitFor(() => expect(patchPcSetupPlacements).toHaveBeenCalled());
      expect(vi.mocked(patchPcSetupPlacements).mock.calls[0][1]).toEqual([{ id: 'case', x: 0, z: 0, yaw: 105 }]);
    });

    it('replays once on a 409 against the current record', async () => {
      withRecord(3, [pc, kb], ['kb-1']);
      const moved = obj('kb-1', 'keyboard', 10, 20);
      const other = obj('mouse-1', 'mouse', 50, 60);
      vi.mocked(patchPcSetupPlacements)
        .mockResolvedValueOnce({ kind: 'conflict', record: record(5, [pc, moved, other], ['kb-1', 'mouse-1']) })
        .mockResolvedValueOnce({ kind: 'saved', rev: 6 });
      const { result } = await mounted();
      await waitFor(() => expect(result.current.setupRev).toBe(3));

      act(() => { result.current.moveItem('kb-1', [100, 5, 200]); });
      await waitFor(() => expect(patchPcSetupPlacements).toHaveBeenCalledTimes(2));

      const [baseRev, places] = vi.mocked(patchPcSetupPlacements).mock.calls[1];
      expect(baseRev).toBe(5);
      expect(places).toEqual([{ id: 'kb-1', x: 100, z: 200, yaw: 0 }]);
      expect(result.current.scene!.objects.map(o => o.id)).toEqual(['case-x', 'kb-1', 'mouse-1']);
      await waitFor(() => expect(result.current.setupRev).toBe(6));
    });

    it('gives up after a second 409 and cancels a move whose item is gone', async () => {
      withRecord(3, [pc, kb], ['kb-1']);
      vi.mocked(patchPcSetupPlacements).mockResolvedValue({ kind: 'conflict', record: record(5, [pc], []) });
      vi.mocked(fetchPcSetup).mockResolvedValue(record(3, [pc, kb], ['kb-1']));
      const { result } = await mounted();
      await waitFor(() => expect(result.current.setupRev).toBe(3));
      vi.mocked(fetchPcSetup).mockResolvedValue(record(5, [pc], []));

      act(() => { result.current.moveItem('kb-1', [100, 5, 200]); });
      await waitFor(() => expect(result.current.setupRev).toBe(5));

      expect(patchPcSetupPlacements).toHaveBeenCalledTimes(1);
      expect(result.current.scene!.objects.map(o => o.id)).toEqual(['case-x']);
    });

    it('refuses to move hand-placed objects while no record exists', async () => {
      vi.mocked(fetchLightingScene).mockResolvedValue({ ...baseScene(), objects: [kb] });
      const { result } = await mounted();
      expect(result.current.setupRev).toBe(0);
      expect(result.current.movable('kb-1')).toBe(false);
      act(() => { result.current.moveItem('kb-1', [100, 5, 200]); });
      expect(result.current.scene!.objects[0].position).toEqual([10, 5, 20]);
      expect(patchPcSetupPlacements).not.toHaveBeenCalled();
    });

    it('sends bindings only once a record owns the objects, and keeps hand-placed objects riding along before one', async () => {
      withRecord(2, [pc, kb], ['kb-1']);
      const owned = await mounted();
      await waitFor(() => expect(owned.result.current.setupRev).toBe(2));
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

  describe('healing a binding left on an old object id', () => {
    const withTop = (id: string, kind: string): SceneObject => ({ ...obj(id, kind, 0, 0), anchors: [{ id: 'top', kind: 'surface', center: [0, 0, 0], right: [1, 0, 0], up: [0, 1, 0], width: 1, height: 1, shape: 'rect' }] });
    const bound = (objectId: string) => ({ deviceId: 'dev', targets: [{ objectId, anchorId: 'top' }], rotation: 0, flip: false });

    it('retargets to the only object of the kind and saves it once', async () => {
      vi.mocked(fetchLightingScene).mockResolvedValue({ ...baseScene(), objects: [withTop('p-mouse-1', 'mouse')], bindings: [bound('mouse-1')] });
      const { result } = await mounted();
      await waitFor(() => expect(result.current.scene!.bindings[0].targets[0].objectId).toBe('p-mouse-1'));
      await waitFor(() => expect(putLightingScene).toHaveBeenCalledTimes(1));
      expect(vi.mocked(putLightingScene).mock.calls[0][0].bindings![0].targets[0].objectId).toBe('p-mouse-1');
    });

    it('does not heal when two objects share the kind, and saves nothing', async () => {
      vi.mocked(fetchLightingScene).mockResolvedValue({ ...baseScene(), objects: [withTop('kb-a', 'keyboard'), withTop('kb-b', 'keyboard')], bindings: [bound('keyboard-1')] });
      const { result } = await mounted();
      await new Promise(resolve => { setTimeout(resolve, 400); });
      expect(result.current.scene!.bindings[0].targets[0].objectId).toBe('keyboard-1');
      expect(putLightingScene).not.toHaveBeenCalled();
    });

    it('leaves a binding whose object exists alone and saves nothing', async () => {
      vi.mocked(fetchLightingScene).mockResolvedValue({ ...baseScene(), objects: [withTop('p-mouse-1', 'mouse')], bindings: [bound('p-mouse-1')] });
      const { result } = await mounted();
      await new Promise(resolve => { setTimeout(resolve, 400); });
      expect(result.current.scene!.bindings[0].targets[0].objectId).toBe('p-mouse-1');
      expect(putLightingScene).not.toHaveBeenCalled();
    });
  });
});
