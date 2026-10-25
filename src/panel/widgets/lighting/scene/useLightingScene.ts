import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchLedMap, type LedMapEntry, type LightingDevice } from '../../../../api/lighting';
import {
  fetchLightingScene,
  fetchSceneModel,
  putLightingScene,
  putSceneView,
  type LightingScene,
  type SceneBinding,
  type SceneCamera,
  type SceneObject,
  type SceneView,
  type Vec3,
} from '../../../../api/lightingScene';
import { fetchPcSetup, patchPcSetupPlacements, PC_SETUP_TOPIC, type PcSetupPlacement, type PcSetupRecord } from '../../../../api/pcSetup';
import { useTopicCallback } from '../../../../hooks/useMultiplexSocket';
import { healBindings } from '../../../../lib/scene/pickDevice';
import { presetCamera } from '../../../../lib/scene/scenePresets';
import { applyPlacements, isMovable, placementId, placementOf, survivingPlaces } from '../../../../lib/scene/setupPlacement';
import { moveObject, turnObject } from './sceneEdits';

// Edits land locally at once and reach the service after a short quiet spell, so a burst of clicks is one write.
const SAVE_DEBOUNCE_MS = 250;
// A camera mid-drag streams drafts at most this often; the hardware follows without flooding the service.
const DRAFT_INTERVAL_MS = 60;
// A view request that has not answered by now stops holding the queue; its sequence number keeps order on the service.
const VIEW_REQUEST_PATIENCE_MS = 8000;

function newSessionId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `s${Math.random().toString(36).slice(2)}`;
}

// Same content, same reference: a refresh that changes nothing must not make the renderer rebuild.
function same<T>(current: T, next: T): T {
  return JSON.stringify(current) === JSON.stringify(next) ? current : next;
}

export interface SceneEdit {
  objects: SceneObject[];
  bindings: SceneBinding[];
}

export interface LightingSceneApi {
  scene: LightingScene | null;
  /** The shared PC setup record revision; 0 until Build saves one. */
  setupRev: number;
  /** Whether Lighting may move and turn this object (the case and desk items of a saved record). */
  movable: (objectId: string) => boolean;
  moveItem: (objectId: string, position: Vec3) => void;
  turnItem: (objectId: string, degrees: number) => void;
  model: ArrayBuffer | null;
  update: (mutate: (current: SceneEdit) => SceneEdit) => void;
  setEnabled: (enabled: boolean) => Promise<void>;
  /** Resolves once a final camera is saved, so a preset snapshot taken after it sees the new view. */
  setCamera: (camera: SceneCamera, final: boolean) => Promise<void>;
  /** Re-reads the view (and the scene when no local edit is waiting), after a preset or another client changed it. */
  refreshView: () => Promise<void>;
}

export function useLightingScene(active: boolean): LightingSceneApi {
  const [scene, setScene] = useState<LightingScene | null>(null);
  const [model, setModel] = useState<ArrayBuffer | null>(null);
  // Readers see bindings left on a gone desk item's id pointed at its successor; nothing is written until a user edit saves them.
  const viewScene = useMemo(() => {
    if (!scene) return null;
    const bindings = healBindings(scene.objects, scene.bindings);
    return bindings === scene.bindings ? scene : { ...scene, bindings };
  }, [scene]);
  const sceneRef = useRef<LightingScene | null>(null);
  sceneRef.current = viewScene;
  const [setup, setSetup] = useState<PcSetupRecord | null>(null);
  const setupRef = useRef<PcSetupRecord | null>(null);
  setupRef.current = setup;
  const pendingPlaces = useRef(new Map<string, PcSetupPlacement>());
  const placeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const placing = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Saves still on the wire: until they land, a refresh must not put the older server copy back.
  const saving = useRef(0);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDraft = useRef(0);
  const pendingDraft = useRef<SceneCamera | null>(null);
  // View requests go out one at a time, numbered within this editor's session, so the service can drop a draft
  // that lands after its commit without comparing clocks across clients.
  const viewChain = useRef<Promise<unknown>>(Promise.resolve());
  const viewSeq = useRef(0);
  const session = useRef<string | null>(null);
  // View requests not yet answered: until they are, a refresh must not put the older saved camera back.
  const viewsInFlight = useRef(0);

  const sendView = useCallback((body: { enabled?: boolean; camera?: SceneCamera; draft?: boolean }) => {
    session.current ??= newSessionId();
    const request = { ...body, session: session.current, seq: ++viewSeq.current };
    viewsInFlight.current++;
    const sent = viewChain.current.then(() => putSceneView(request)).finally(() => { viewsInFlight.current--; });
    const patience = new Promise(resolve => { setTimeout(resolve, VIEW_REQUEST_PATIENCE_MS); });
    viewChain.current = Promise.race([sent, patience]).catch(() => null);
    return sent;
  }, []);

  const refreshView = useCallback(async () => {
    const [next, record] = await Promise.all([fetchLightingScene(), fetchPcSetup()]);
    if (!next) return;
    const placesPending = !!placeTimer.current || placing.current > 0;
    if (record && !placesPending) setSetup(cur => same(cur, record));
    setScene(s => {
      if (!s) return next;
      const editsPending = !!saveTimer.current || saving.current > 0;
      return {
        ...s,
        objects: editsPending || placesPending ? s.objects : same(s.objects, next.objects),
        bindings: editsPending ? s.bindings : same(s.bindings, next.bindings),
        view: viewsInFlight.current > 0 ? s.view : same(s.view, next.view),
        modelRev: next.modelRev,
        caseId: next.caseId,
      };
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
    // A saved record owns the objects and the service ignores them here; without one the legacy objects ride along unchanged.
    const record = setupRef.current;
    const ownsObjects = !!record && record.rev > 0 && record.setup.resolved.objects.length > 0;
    void putLightingScene({ bindings: current.bindings, ...(ownsObjects ? {} : { objects: current.objects }) }).then(saved => {
      // Only the server-owned fields come back; local edits made meanwhile stay.
      if (saved) setScene(s => (s ? { ...s, modelRev: saved.modelRev, caseId: saved.caseId } : s));
    }).finally(() => { saving.current--; });
  }, []);

  const sendPlacements = useCallback(async (initial: PcSetupPlacement[]): Promise<void> => {
    let places = initial;
    // One replay on a stale revision, then the record as the service holds it wins.
    for (let attempt = 0; attempt < 2 && places.length > 0; attempt++) {
      const record = setupRef.current;
      if (!record) break;
      const resolved = { ...record.setup.resolved, objects: applyPlacements(record.setup.resolved.objects, places) };
      const res = await patchPcSetupPlacements(record.rev, places);
      if (res.kind === 'saved') {
        const next = { rev: res.rev, setup: { ...record.setup, resolved } };
        setupRef.current = next;
        setSetup(next);
        return;
      }
      if (res.kind !== 'conflict') break;
      setupRef.current = res.record;
      setSetup(res.record);
      // An item removed in Build meanwhile cancels its move.
      places = survivingPlaces(res.record.setup, places);
      const objects = applyPlacements(res.record.setup.resolved.objects, places);
      setScene(s => (s ? { ...s, objects } : s));
    }
    const current = await fetchPcSetup();
    if (!current) return;
    setupRef.current = current;
    setSetup(current);
    const objects = current.setup.resolved.objects;
    if (objects.length > 0) setScene(s => (s ? { ...s, objects } : s));
  }, []);

  const flushPlacements = useCallback(() => {
    if (placeTimer.current) clearTimeout(placeTimer.current);
    placeTimer.current = null;
    const places = [...pendingPlaces.current.values()];
    pendingPlaces.current.clear();
    if (places.length === 0) return;
    placing.current++;
    void sendPlacements(places).finally(() => { placing.current--; });
  }, [sendPlacements]);

  const queuePlacement = useCallback((id: string, obj: SceneObject) => {
    pendingPlaces.current.set(id, placementOf(id, obj));
    if (placeTimer.current) clearTimeout(placeTimer.current);
    placeTimer.current = setTimeout(flushPlacements, SAVE_DEBOUNCE_MS);
  }, [flushPlacements]);

  const movable = useCallback((objectId: string) => {
    const obj = sceneRef.current?.objects.find(o => o.id === objectId);
    return !!obj && isMovable(setupRef.current?.setup ?? null, setupRef.current?.rev ?? 0, obj);
  }, []);

  const editPose = useCallback((objectId: string, edit: (s: SceneEdit) => SceneEdit) => {
    const current = sceneRef.current;
    const record = setupRef.current;
    if (!current || !record || !movable(objectId)) return;
    const next = edit({ objects: current.objects, bindings: current.bindings });
    const obj = next.objects.find(o => o.id === objectId);
    const id = obj ? placementId(record.setup, obj) : null;
    if (!obj || !id) return;
    setScene(s => (s ? { ...s, objects: next.objects } : s));
    queuePlacement(id, obj);
  }, [movable, queuePlacement]);

  const moveItem = useCallback((objectId: string, position: Vec3) => editPose(objectId, s => moveObject(s, objectId, position)), [editPose]);
  const turnItem = useCallback((objectId: string, degrees: number) => editPose(objectId, s => turnObject(s, objectId, degrees)), [editPose]);

  useTopicCallback(PC_SETUP_TOPIC, active, useCallback((frame: unknown) => {
    const rev = (frame as { rev?: unknown } | null)?.rev;
    if (typeof rev === 'number' && rev === setupRef.current?.rev) return;
    void refreshView();
  }, [refreshView]));

  // An edit still waiting when the page goes away (Edit in Build navigates at once) is sent, not dropped.
  useEffect(() => () => {
    if (placeTimer.current) flushPlacements();
    if (saveTimer.current) flush();
    if (draftTimer.current) clearTimeout(draftTimer.current);
  }, [flush, flushPlacements]);

  const update = useCallback((mutate: (current: SceneEdit) => SceneEdit) => {
    setScene(s => {
      if (!s) return s;
      const next = mutate({ objects: s.objects, bindings: healBindings(s.objects, s.bindings) });
      return { ...s, bindings: next.bindings };
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

  return { scene: viewScene, setupRev: setup?.rev ?? 0, movable, moveItem, turnItem, model, update, setEnabled, setCamera, refreshView };
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
