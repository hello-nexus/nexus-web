import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchLedMap, type LedMapEntry, type LightingDevice } from '../../../../api/lighting';
import {
  deleteSceneImport,
  fetchLightingScene,
  fetchSceneModel,
  putLightingScene,
  putSceneView,
  type LightingScene,
  type SceneBinding,
  type SceneCamera,
  type SceneObject,
  type SceneView,
} from '../../../../api/lightingScene';
import { presetCamera } from '../../../../lib/scene/scenePresets';

// Edits land locally at once and reach the service after a short quiet spell, so a burst of clicks is one write.
const SAVE_DEBOUNCE_MS = 250;
// A camera mid-drag streams drafts at most this often; the hardware follows without flooding the service.
const DRAFT_INTERVAL_MS = 60;

export interface SceneEdit {
  objects: SceneObject[];
  bindings: SceneBinding[];
}

export interface LightingSceneApi {
  scene: LightingScene | null;
  model: ArrayBuffer | null;
  update: (mutate: (current: SceneEdit) => SceneEdit) => void;
  setEnabled: (enabled: boolean) => Promise<void>;
  /** Resolves once a final camera is saved, so a preset snapshot taken after it sees the new view. */
  setCamera: (camera: SceneCamera, final: boolean) => Promise<void>;
  removeImport: () => Promise<void>;
  /** Re-reads the view (and the scene when no local edit is waiting), after a preset or another client changed it. */
  refreshView: () => Promise<void>;
}

export function useLightingScene(active: boolean): LightingSceneApi {
  const [scene, setScene] = useState<LightingScene | null>(null);
  const [model, setModel] = useState<ArrayBuffer | null>(null);
  const sceneRef = useRef<LightingScene | null>(null);
  sceneRef.current = scene;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Saves still on the wire: until they land, a refresh must not put the older server copy back.
  const saving = useRef(0);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDraft = useRef(0);
  const pendingDraft = useRef<SceneCamera | null>(null);
  // View requests go out one at a time and numbered, so the service can drop a draft that lands after its commit.
  const viewChain = useRef<Promise<unknown>>(Promise.resolve());
  const viewSeq = useRef(0);

  const sendView = useCallback((body: { enabled?: boolean; camera?: SceneCamera; draft?: boolean }) => {
    // Clock-based so a reload never restarts below numbers the service already saw.
    const seq = viewSeq.current = Math.max(viewSeq.current + 1, Date.now());
    const sent = viewChain.current.then(() => putSceneView({ ...body, seq }));
    viewChain.current = sent.catch(() => null);
    return sent;
  }, []);

  const refreshView = useCallback(async () => {
    const next = await fetchLightingScene();
    if (!next) return;
    setScene(s => {
      if (!s || (!saveTimer.current && saving.current === 0)) return next;
      return { ...s, view: next.view, modelRev: next.modelRev, caseId: next.caseId };
    });
  }, []);

  useEffect(() => {
    if (active) void refreshView();
  }, [active, refreshView]);

  const modelRev = scene?.modelRev ?? null;
  useEffect(() => {
    if (!active || !modelRev) {
      setModel(null);
      return undefined;
    }
    let cancelled = false;
    void fetchSceneModel().then(bytes => { if (!cancelled) setModel(bytes); });
    return () => { cancelled = true; };
  }, [active, modelRev]);

  const flush = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const current = sceneRef.current;
    if (!current) return;
    saving.current++;
    void putLightingScene({ objects: current.objects, bindings: current.bindings }).then(saved => {
      // Only the server-owned fields come back; local edits made meanwhile stay.
      if (saved) setScene(s => (s ? { ...s, modelRev: saved.modelRev, caseId: saved.caseId } : s));
    }).finally(() => { saving.current--; });
  }, []);

  // An edit still waiting when the page goes away (Edit in Build navigates at once) is sent, not dropped.
  useEffect(() => () => {
    if (saveTimer.current) flush();
    if (draftTimer.current) clearTimeout(draftTimer.current);
  }, [flush]);

  const update = useCallback((mutate: (current: SceneEdit) => SceneEdit) => {
    setScene(s => {
      if (!s) return s;
      const next = mutate({ objects: s.objects, bindings: s.bindings });
      return { ...s, objects: next.objects, bindings: next.bindings };
    });
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
  }, [flush]);

  const setEnabled = useCallback(async (enabled: boolean) => {
    const before = sceneRef.current?.view;
    const camera = before?.camera ?? (enabled ? presetCamera(sceneRef.current?.objects ?? [], 'angle') : undefined);
    setScene(s => (s ? { ...s, view: { enabled, camera: camera ?? s.view.camera } } : s));
    const saved = await sendView({ enabled, camera: camera ?? undefined }) as SceneView | null;
    // A failed save puts the switch back; a saved one keeps any camera moved while it was in flight.
    setScene(s => (s ? { ...s, view: saved ? { ...s.view, enabled: saved.enabled } : (before ?? s.view) } : s));
  }, [sendView]);

  const sendDraft = useCallback(() => {
    draftTimer.current = null;
    const cam = pendingDraft.current;
    if (!cam) return;
    pendingDraft.current = null;
    lastDraft.current = Date.now();
    void sendView({ camera: cam, draft: true });
  }, [sendView]);

  const setCamera = useCallback(async (camera: SceneCamera, final: boolean) => {
    setScene(s => (s ? { ...s, view: { ...s.view, camera } } : s));
    if (final) {
      pendingDraft.current = null;
      if (draftTimer.current) {
        clearTimeout(draftTimer.current);
        draftTimer.current = null;
      }
      await sendView({ camera });
      return;
    }
    pendingDraft.current = camera;
    if (draftTimer.current) return;
    const wait = Math.max(0, DRAFT_INTERVAL_MS - (Date.now() - lastDraft.current));
    draftTimer.current = setTimeout(sendDraft, wait);
  }, [sendView, sendDraft]);

  const removeImport = useCallback(async () => {
    const next = await deleteSceneImport();
    if (next) setScene(next);
  }, []);

  return { scene, model, update, setEnabled, setCamera, removeImport, refreshView };
}

/** LED maps of the placed devices, refetched when a device's LED count changes. */
export function useSceneLedMaps(deviceIds: string[], devices: LightingDevice[]): Map<string, LedMapEntry[] | null> {
  const [maps, setMaps] = useState<Map<string, LedMapEntry[] | null>>(new Map());
  const loaded = useRef(new Map<string, string>());
  const counts = new Map(devices.map(d => [d.id, d.ledCount]));
  const want = deviceIds.map(id => `${id}\n${counts.get(id) ?? 0}`).sort().join('|');

  useEffect(() => {
    for (const id of deviceIds) {
      const key = `${counts.get(id) ?? 0}`;
      if (loaded.current.get(id) === key) continue;
      loaded.current.set(id, key);
      void fetchLedMap(id).then(res => {
        // A newer LED count superseded this fetch.
        if (loaded.current.get(id) !== key) return;
        // A failed fetch is tried again the next time the placed set or a count changes.
        if (!res) loaded.current.delete(id);
        setMaps(m => new Map(m).set(id, res?.leds ?? null));
      });
    }
    // `want` captures every id and LED count this effect reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want]);

  return maps;
}
