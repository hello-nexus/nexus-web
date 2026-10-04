import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Box, FlipHorizontal2, Link, MapPin, Move3d, Pencil, RotateCw, X, Zap } from 'lucide-react';
import { identifyLightingDevice, type LightingDevice } from '../../../../api/lighting';
import type { SceneBinding, SceneCamera, SceneObject, Vec3 } from '../../../../api/lightingScene';
import type { AudioSnapshot } from '../../../../hooks/useAudioState';
import type { EffectState } from '../../../../types/lighting';
import { Button } from '../../../../components/common/Button/Button';
import { useToastSafe } from '../../../../components/common/Toast/Toast';
import { useTranslation } from '../../../../lib/i18n';
import { pluralKey } from '../../../../lib/pluralKey';
import { autoPlace } from '../../../../lib/scene/autoPlace';
import { ledWorldPositions, placements } from '../../../../lib/scene/sceneMath';
import { DEFAULT_FOV, presetCamera, type CameraPreset } from '../../../../lib/scene/scenePresets';
import type { ScenePick } from '../../../../lib/scene/sceneRenderer';
import { requestOpenBuild } from '../../../../components/views/BuildPage/buildNav';
import { SceneViewport } from './SceneViewport';
import { anchorLabel, objectLabel } from './sceneLabels';
import { flipBinding, moveObject, placeDevice, rotateBinding } from './sceneEdits';
import { useSceneLedMaps, type LightingSceneApi } from './useLightingScene';
import styles from './Scene.module.scss';

export interface LightingScene3DProps {
  api: LightingSceneApi;
  devices: LightingDevice[];
  selectedDeviceId: string | null;
  onSelectDevice: (id: string | null) => void;
  shaderEffect: string | null;
  shaderState: EffectState | null;
  shaderPaused?: boolean;
  audioRef?: RefObject<AudioSnapshot | null>;
  /** Starts walking through the unplaced devices as soon as the scene is ready (the first switch to 3D). */
  startPlacing?: boolean;
  onPlacingStarted?: () => void;
  /** After a camera commit, so the active layout preset can save it. */
  onLayoutCommit?: () => void;
}

const PRESETS: CameraPreset[] = ['front', 'angle', 'side', 'top'];
const TOAST_MS = 2600;
// Long enough to find the blinking device on the desk before it stops.
const BLINK_MS = 4000;

/** World LED positions of every placed device, from the scene and each device's LED map. */
function useSceneLeds(api: LightingSceneApi, devices: LightingDevice[]): Map<string, Float32Array> {
  const objects = api.scene?.objects;
  const bindings = api.scene?.bindings;
  const boundIds = useMemo(() => (bindings ?? []).map(b => b.deviceId), [bindings]);
  const maps = useSceneLedMaps(boundIds, devices);
  // Keyed on what positions depend on, so a camera move or a device poll that changes nothing here keeps the
  // same Map and the renderer skips its rebuild.
  const counts = devices.map(d => `${d.id}:${d.ledCount}`).join('\n');
  return useMemo(() => {
    const out = new Map<string, Float32Array>();
    if (!objects || !bindings) return out;
    const ledCount = new Map(counts.split('\n').map(entry => {
      const at = entry.lastIndexOf(':');
      return [entry.slice(0, at), Number(entry.slice(at + 1))] as const;
    }));
    for (const [id, quads] of placements({ objects, bindings })) {
      const n = ledCount.get(id);
      if (n === undefined) continue;
      out.set(id, ledWorldPositions(n, maps.get(id), quads));
    }
    return out;
  }, [objects, bindings, counts, maps]);
}

type Translate = (key: string, params?: Record<string, string | number>) => string;

const onSpot = (b: SceneBinding, pick: { objectId: string; anchorId: string }) =>
  b.targets.some(tg => tg.objectId === pick.objectId && tg.anchorId === pick.anchorId);

/** The hover chip's text: who sits on a spot, or that it is free; an object's name. */
function sceneHoverLabel(t: Translate, scene: { objects: SceneObject[]; bindings: SceneBinding[] }, devices: LightingDevice[], pick: ScenePick): string | null {
  const obj = scene.objects.find(o => o.id === pick.objectId);
  if (!obj) return null;
  if (pick.kind === 'object') return objectLabel(t, obj);
  const anchor = obj.anchors.find(a => a.id === pick.anchorId);
  if (!anchor) return null;
  const spot = anchorLabel(t, obj, anchor);
  const names = scene.bindings.filter(b => onSpot(b, pick)).map(b => devices.find(d => d.id === b.deviceId)?.name ?? b.deviceId);
  if (names.length === 0) return t('lighting.scene.hover.free', { spot });
  // A device named after its spot (a "Top fan 2" on Top fan 2) needs saying once.
  if (names.length === 1 && names[0].trim().toLowerCase() === spot.toLowerCase()) return names[0];
  return t('lighting.scene.hover.placed', { device: names.join(', '), spot });
}

interface Placing {
  deviceId: string;
  /** Adds another spot to the device (a fan chain) instead of moving it. */
  append: boolean;
}

/**
 * The 3D view in place of the 2D canvas. Edit scene moves and turns what is on the desk the way Build does, and
 * places devices on their spots (each blinks so it can be found on the desk). What is on the desk comes from Build.
 */
export default function LightingScene3D({
  api, devices, selectedDeviceId, onSelectDevice, shaderEffect, shaderState, shaderPaused, audioRef,
  startPlacing, onPlacingStarted, onLayoutCommit,
}: LightingScene3DProps) {
  const { t, language } = useTranslation();
  const leds = useSceneLeds(api, devices);
  const scene = api.scene;
  const toast = useToastSafe();
  const flash = useCallback((title: string) => toast.push({ title, durationMs: TOAST_MS }), [toast]);
  const [placing, setPlacing] = useState<Placing | null>(null);
  // Walking through every unplaced device, one blink and click at a time; skipped ones are not offered again.
  const [guided, setGuided] = useState(false);
  // Edit scene mode: objects select, move and turn, and a device's spot shows its tools where it was clicked.
  const [editing, setEditing] = useState(false);
  const [spotTools, setSpotTools] = useState<{ deviceId: string; x: number; y: number } | null>(null);
  const skipped = useRef(new Set<string>());

  const placeable = useMemo(() => devices.filter(d => d.controlled !== false && d.ledCount > 0), [devices]);
  const bindingOf = useCallback((id: string) => scene?.bindings.find(b => b.deviceId === id), [scene?.bindings]);
  const unplaced = useMemo(() => placeable.filter(d => !bindingOf(d.id)), [placeable, bindingOf]);
  const deviceName = useCallback((id: string) => devices.find(d => d.id === id)?.name ?? id, [devices]);

  const blink = useCallback((id: string) => { identifyLightingDevice(id, BLINK_MS).catch(() => { /* a device that cannot blink still places */ }); }, []);

  const onCamera = useCallback((cam: SceneCamera, final: boolean) => {
    const saved = api.setCamera(cam, final);
    // The active preset snapshots the saved view, so it saves only once the camera has landed.
    if (final) void saved.then(() => onLayoutCommit?.());
  }, [api, onLayoutCommit]);

  /** Offers the next unplaced device: selects it in the list and blinks it. */
  const offerNext = useCallback((after: Set<string>) => {
    const next = unplaced.find(d => !after.has(d.id) && !skipped.current.has(d.id));
    if (!next) {
      setGuided(false);
      setPlacing(null);
      flash(t('lighting.scene.place.allDone'));
      return;
    }
    onSelectDevice(next.id);
    setPlacing({ deviceId: next.id, append: false });
    blink(next.id);
  }, [unplaced, onSelectDevice, blink, flash, t]);

  const startGuide = useCallback(() => {
    if (!scene) return;
    skipped.current = new Set();
    const sure = autoPlace(scene.objects, scene.bindings, placeable);
    if (sure.placed.length > 0) {
      api.update(s => ({ ...s, bindings: sure.bindings }));
      flash(t(pluralKey('lighting.scene.devices.autoPlaced', language, sure.placed.length), { count: sure.placed.length }));
    }
    setGuided(true);
    offerNext(new Set(sure.placed));
  }, [scene, placeable, api, flash, t, language, offerNext]);

  // Ending the walk also lets go of the device it was offering, or that device would keep asking for a spot.
  const stopGuide = useCallback(() => {
    setGuided(false);
    setPlacing(null);
    if (guided) onSelectDevice(null);
  }, [guided, onSelectDevice]);

  useEffect(() => {
    if (!startPlacing || !scene || scene.objects.length === 0) return;
    onPlacingStarted?.();
    if (unplaced.length > 0) {
      setEditing(true);
      startGuide();
    }
  }, [startPlacing, scene, unplaced.length, startGuide, onPlacingStarted]);

  // In edit mode a device picked in the list that has no spot yet is waiting for one.
  const waiting = useMemo<Placing | null>(() => placing ?? (editing && selectedDeviceId && !bindingOf(selectedDeviceId) && placeable.some(d => d.id === selectedDeviceId)
    ? { deviceId: selectedDeviceId, append: false } : null), [placing, editing, selectedDeviceId, bindingOf, placeable]);

  const place = useCallback((p: Placing, objectId: string, anchorId: string) => {
    api.update(s => placeDevice(s, p.deviceId, objectId, anchorId, p.append));
    setSpotTools(null);
    if (guided && !p.append) {
      offerNext(new Set([p.deviceId]));
      return;
    }
    setPlacing(null);
    onSelectDevice(p.deviceId);
  }, [api, guided, offerNext, onSelectDevice]);

  const onPick = useCallback((pick: ScenePick | null, x: number, y: number) => {
    if (!scene) return;
    if (pick?.kind === 'anchor') {
      if (waiting) {
        place(waiting, pick.objectId, pick.anchorId);
        return;
      }
      const bound = scene.bindings.find(b => onSpot(b, pick));
      if (bound) onSelectDevice(bound.deviceId);
      // A device's spot shows its tools beside the click, in edit mode only.
      setSpotTools(editing && bound ? { deviceId: bound.deviceId, x, y } : null);
      return;
    }
    setSpotTools(null);
    if (!guided) setPlacing(null);
  }, [scene, waiting, place, editing, guided, onSelectDevice]);

  const onMoveObject = useCallback((objectId: string, position: Vec3, yaw: number) => {
    api.update(s => moveObject(s, objectId, position, yaw));
  }, [api]);

  const toggleEditing = useCallback(() => {
    if (editing) stopGuide();
    setSpotTools(null);
    setEditing(!editing);
  }, [editing, stopGuide]);

  useEffect(() => {
    if (!placing && !guided && !spotTools) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setSpotTools(null);
      stopGuide();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placing, guided, spotTools, stopGuide]);

  if (!scene) return <div className={styles.viewport} />;
  const fov = scene.view.camera?.fov ?? DEFAULT_FOV;
  const empty = scene.objects.length === 0;
  const caseObj = scene.objects.find(o => o.kind === 'case');

  return (
    <SceneViewport
      scene={scene}
      model={api.model}
      leds={leds}
      selectedDeviceId={selectedDeviceId}
      placing={waiting !== null}
      editing={editing}
      shaderEffect={shaderEffect}
      shaderState={shaderState}
      shaderPaused={shaderPaused}
      audioRef={audioRef}
      onPick={onPick}
      onMoveObject={onMoveObject}
      onCamera={onCamera}
      hoverLabel={pick => sceneHoverLabel(t, scene, devices, pick)}
    >
      <div className={styles.overlayTop}>
        <div className={styles.pillGroup} role="group" aria-label={t('lighting.scene.camera.label')}>
          {PRESETS.map(p => (
            <button key={p} type="button" className={styles.pillButton} onClick={() => onCamera(presetCamera(scene.objects, p, fov), true)}>
              {t(`lighting.scene.camera.${p}`)}
            </button>
          ))}
        </div>
        {!empty && (
          <Button size="sm" tone={editing ? 'accent' : 'neutral'} icon={<Pencil size={13} strokeWidth={1.8} />} aria-pressed={editing} onClick={toggleEditing}>
            {t(editing ? 'lighting.scene.done' : 'lighting.scene.edit')}
          </Button>
        )}
        {!empty && unplaced.length > 0 && !guided && (
          <Button size="sm" tone="neutral" icon={<MapPin size={13} strokeWidth={1.8} />} onClick={() => { setEditing(true); startGuide(); }}>
            {t('lighting.scene.place.start')}
            <span className={styles.countBadge}>{unplaced.length}</span>
          </Button>
        )}
        <Button size="sm" tone="neutral" icon={<Box size={13} strokeWidth={1.8} />} onClick={() => requestOpenBuild('/builder')}>
          {t('lighting.scene.pc.update')}
        </Button>
      </div>

      {spotTools && editing && !waiting && (
        <div className={styles.spotTools} style={{ left: spotTools.x, top: spotTools.y }} role="toolbar" aria-label={deviceName(spotTools.deviceId)}>
          <span className={styles.spotToolsName}>{deviceName(spotTools.deviceId)}</span>
          <Button size="sm" tone="ghost" icon={<RotateCw size={13} strokeWidth={1.8} />} onClick={() => api.update(s => rotateBinding(s, spotTools.deviceId))}>{t('lighting.scene.device.rotate')}</Button>
          <Button size="sm" tone="ghost" icon={<FlipHorizontal2 size={13} strokeWidth={1.8} />} onClick={() => api.update(s => flipBinding(s, spotTools.deviceId))}>{t('lighting.scene.device.flip')}</Button>
          <Button size="sm" tone="ghost" icon={<Move3d size={13} strokeWidth={1.8} />} onClick={() => { setPlacing({ deviceId: spotTools.deviceId, append: false }); setSpotTools(null); }}>{t('lighting.scene.device.move')}</Button>
          <Button size="sm" tone="ghost" icon={<Link size={13} strokeWidth={1.8} />} onClick={() => { setPlacing({ deviceId: spotTools.deviceId, append: true }); setSpotTools(null); }}>{t('lighting.scene.device.addSurface')}</Button>
          <Button size="sm" tone="ghost" icon={<Zap size={13} strokeWidth={1.8} />} onClick={() => blink(spotTools.deviceId)}>{t('lighting.scene.device.identify')}</Button>
        </div>
      )}

      {empty ? (
        <div className={styles.emptyCard}>
          <div className={styles.emptyTitle}>{t('lighting.scene.empty.title')}</div>
          <div className={styles.emptyBody}>{t('lighting.scene.empty.build')}</div>
          <Button size="md" tone="accent" icon={<Box size={14} strokeWidth={1.8} />} onClick={() => requestOpenBuild('/builder')}>
            {t('lighting.scene.pc.fromBuild')}
          </Button>
        </div>
      ) : waiting ? (
        <div className={styles.overlayBottom} aria-live="polite">
          <div className={styles.hint}>
            {t(waiting.append ? 'lighting.scene.hint.append' : guided ? 'lighting.scene.place.blinking' : 'lighting.scene.hint.place', { device: deviceName(waiting.deviceId) })}
          </div>
          <Button size="sm" tone="neutral" icon={<Zap size={13} strokeWidth={1.8} />} onClick={() => blink(waiting.deviceId)}>{t('lighting.scene.place.blinkAgain')}</Button>
          {guided && (
            <Button size="sm" tone="neutral" onClick={() => { skipped.current.add(waiting.deviceId); offerNext(new Set([waiting.deviceId])); }}>
              {t('lighting.scene.place.skip')}
            </Button>
          )}
          <Button size="sm" tone="ghost" icon={<X size={13} strokeWidth={1.8} />} onClick={guided ? stopGuide : () => { setPlacing(null); onSelectDevice(null); }}>
            {t(guided ? 'lighting.scene.done' : 'lighting.scene.cancel')}
          </Button>
        </div>
      ) : (
        <div className={styles.overlayBottom}>
          <div className={styles.hint}>
            {editing ? t('lighting.scene.hint.edit')
              : caseObj && !caseObj.anchors.some(a => a.kind === 'fan') ? t('lighting.scene.pc.noFans') : t('lighting.scene.hint.orbit')}
          </div>
        </div>
      )}
    </SceneViewport>
  );
}
