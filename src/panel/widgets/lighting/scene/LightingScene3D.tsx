import { useCallback, useMemo, useRef, useState, type RefObject } from 'react';
import {
  Box, Eye, EyeOff, FlipHorizontal2, Headphones, Keyboard, Lightbulb, Link, Monitor, Mouse, Move3d, Pencil,
  RectangleHorizontal, RotateCcw, RotateCw, Speaker, Square, Trash2, WandSparkles, X, Zap,
} from 'lucide-react';
import type { LightingDevice } from '../../../../api/lighting';
import type { SceneCamera, SceneObject, Vec3 } from '../../../../api/lightingScene';
import type { AudioSnapshot } from '../../../../hooks/useAudioState';
import type { EffectState } from '../../../../types/lighting';
import { Button } from '../../../../components/common/Button/Button';
import { Overlay } from '../../../../components/common/Overlay/Overlay';
import { ExperimentalBadge } from '../../../../components/common/ExperimentalBadge/ExperimentalBadge';
import { useToastSafe } from '../../../../components/common/Toast/Toast';
import { useTranslation } from '../../../../lib/i18n';
import { pluralKey } from '../../../../lib/pluralKey';
import { autoPlace } from '../../../../lib/scene/autoPlace';
import { DESK_KINDS, genericCase, newDeskObject, type DeskKind } from '../../../../lib/scene/deskCatalog';
import { ledWorldPositions, placements } from '../../../../lib/scene/sceneMath';
import { DEFAULT_FOV, presetCamera, type CameraPreset } from '../../../../lib/scene/scenePresets';
import type { ScenePick, SceneRenderer } from '../../../../lib/scene/sceneRenderer';
import { requestOpenBuild } from '../../../../components/views/BuildPage/buildNav';
import { SceneViewport, DEVICE_DRAG_TYPE, type Backdrop } from './SceneViewport';
import { anchorLabel, objectLabel } from './sceneLabels';
import { addObject, flipBinding, moveObject, placeDevice, removeObject, rotateBinding, turnObject, unplaceDevice } from './sceneEdits';
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
  editorOpen: boolean;
  onEditorOpenChange: (open: boolean) => void;
  onIdentify?: (deviceId: string) => void;
  /** After a camera commit, so the active layout preset can save it. */
  onLayoutCommit?: () => void;
}

const PRESETS: CameraPreset[] = ['front', 'angle', 'side', 'top'];
const TURN_STEP = 15;
const TOAST_MS = 2600;

const DESK_ICONS: Record<DeskKind, typeof Keyboard> = {
  keyboard: Keyboard,
  mouse: Mouse,
  mousepad: Square,
  deskmat: RectangleHorizontal,
  headset: Headphones,
  monitor: Monitor,
  speaker: Speaker,
  strip: RectangleHorizontal,
  light: Lightbulb,
};

const BACKDROP_NEXT: Record<Backdrop, Backdrop> = { dim: 'full', full: 'off', off: 'dim' };

/** World LED positions of every placed device, from the scene and each device's LED map. */
function useSceneLeds(api: LightingSceneApi, devices: LightingDevice[]): Map<string, Float32Array> {
  const objects = api.scene?.objects;
  const bindings = api.scene?.bindings;
  const boundIds = useMemo(() => (bindings ?? []).map(b => b.deviceId), [bindings]);
  const maps = useSceneLedMaps(boundIds, devices);
  // Keyed on what positions depend on, so a camera move or a device poll that changes nothing here keeps the
  // same Map and the renderer skips its rebuild.
  const counts = devices.map(d => `${d.id}:${d.ledCount}`).join('|');
  return useMemo(() => {
    const out = new Map<string, Float32Array>();
    if (!objects || !bindings) return out;
    const ledCount = new Map(counts.split('|').map(entry => {
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

/** The hover chip's text: who sits on a spot, or that it is free; an object's name. */
function sceneHoverLabel(t: Translate, scene: { objects: SceneObject[]; bindings: { deviceId: string; targets: { objectId: string; anchorId: string }[] }[] }, devices: LightingDevice[], pick: ScenePick): string | null {
  const obj = scene.objects.find(o => o.id === pick.objectId);
  if (!obj) return null;
  if (pick.kind === 'object') return objectLabel(t, obj);
  const anchor = obj.anchors.find(a => a.id === pick.anchorId);
  if (!anchor) return null;
  const spot = anchorLabel(t, obj, anchor);
  const names = scene.bindings
    .filter(b => b.targets.some(tg => tg.objectId === pick.objectId && tg.anchorId === pick.anchorId))
    .map(b => devices.find(d => d.id === b.deviceId)?.name ?? b.deviceId);
  if (names.length === 0) return t('lighting.scene.hover.free', { spot });
  // A device named after its spot (a "Top fan 2" on Top fan 2) needs saying once.
  if (names.length === 1 && names[0].trim().toLowerCase() === spot.toLowerCase()) return names[0];
  return t('lighting.scene.hover.placed', { device: names.join(', '), spot });
}

function CameraPresets({ objects, fov, onCamera }: { objects: SceneObject[]; fov: number; onCamera: (cam: SceneCamera) => void }) {
  const { t } = useTranslation();
  return (
    <div className={styles.pillGroup} role="group" aria-label={t('lighting.scene.camera.label')}>
      {PRESETS.map(p => (
        <button key={p} type="button" className={styles.pillButton} onClick={() => onCamera(presetCamera(objects, p, fov))}>
          {t(`lighting.scene.camera.${p}`)}
        </button>
      ))}
    </div>
  );
}

function BackdropButton({ value, onChange }: { value: Backdrop; onChange: (next: Backdrop) => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className={styles.iconButton}
      onClick={() => onChange(BACKDROP_NEXT[value])}
      aria-label={t(`lighting.scene.backdrop.${value}`)}
      title={t(`lighting.scene.backdrop.${value}`)}
    >
      {value === 'off' ? <EyeOff size={15} strokeWidth={1.6} /> : <Eye size={15} strokeWidth={1.6} />}
    </button>
  );
}

export default function LightingScene3D({
  api, devices, selectedDeviceId, onSelectDevice, shaderEffect, shaderState, shaderPaused, audioRef,
  editorOpen, onEditorOpenChange, onIdentify, onLayoutCommit,
}: LightingScene3DProps) {
  const { t } = useTranslation();
  const leds = useSceneLeds(api, devices);
  const [backdrop, setBackdrop] = useState<Backdrop>('dim');
  const scene = api.scene;

  const onCamera = useCallback((cam: SceneCamera, final: boolean) => {
    const saved = api.setCamera(cam, final);
    // The active preset snapshots the saved view, so it saves only once the camera has landed.
    if (final) void saved.then(() => onLayoutCommit?.());
  }, [api, onLayoutCommit]);

  const onInlinePick = useCallback((pick: ScenePick | null) => {
    if (!scene || pick?.kind !== 'anchor') return;
    const bound = scene.bindings.find(b => b.targets.some(tg => tg.objectId === pick.objectId && tg.anchorId === pick.anchorId));
    if (bound) onSelectDevice(bound.deviceId);
  }, [scene, onSelectDevice]);

  if (!scene) return <div className={styles.viewport} />;
  const empty = scene.bindings.length === 0;
  const fov = scene.view.camera?.fov ?? DEFAULT_FOV;

  return (
    <>
      <SceneViewport
        scene={scene}
        model={api.model}
        leds={leds}
        selectedDeviceId={selectedDeviceId}
        selectedObjectId={null}
        placing={false}
        editable={false}
        backdrop={backdrop}
        shaderEffect={shaderEffect}
        shaderState={shaderState}
        shaderPaused={shaderPaused}
        audioRef={audioRef}
        onPick={onInlinePick}
        onCamera={onCamera}
        hoverLabel={pick => sceneHoverLabel(t, scene, devices, pick)}
        publishPoints
        active={!editorOpen}
      >
        <div className={styles.overlayTop}>
          <CameraPresets objects={scene.objects} fov={fov} onCamera={cam => onCamera(cam, true)} />
          <BackdropButton value={backdrop} onChange={setBackdrop} />
          <Button size="sm" tone="accent" icon={<Pencil size={13} strokeWidth={1.8} />} onClick={() => onEditorOpenChange(true)}>
            {t('lighting.scene.edit')}
          </Button>
        </div>
        {empty && (
          <div className={styles.emptyCard}>
            <div className={styles.emptyTitle}>{t('lighting.scene.empty.title')}</div>
            <div className={styles.emptyBody}>{t('lighting.scene.empty.inline')}</div>
            <Button size="md" tone="accent" icon={<Box size={14} strokeWidth={1.8} />} onClick={() => onEditorOpenChange(true)}>
              {t('lighting.scene.empty.open')}
            </Button>
          </div>
        )}
      </SceneViewport>
      {editorOpen && (
        <SceneEditor
          api={api}
          devices={devices}
          leds={leds}
          backdrop={backdrop}
          onBackdrop={setBackdrop}
          shaderEffect={shaderEffect}
          shaderState={shaderState}
          shaderPaused={shaderPaused}
          audioRef={audioRef}
          onCamera={onCamera}
          onClose={() => onEditorOpenChange(false)}
          onIdentify={onIdentify}
          initialDeviceId={selectedDeviceId}
        />
      )}
    </>
  );
}

interface SceneEditorProps {
  api: LightingSceneApi;
  devices: LightingDevice[];
  leds: Map<string, Float32Array>;
  backdrop: Backdrop;
  onBackdrop: (next: Backdrop) => void;
  shaderEffect: string | null;
  shaderState: EffectState | null;
  shaderPaused?: boolean;
  audioRef?: RefObject<AudioSnapshot | null>;
  onCamera: (cam: SceneCamera, final: boolean) => void;
  onClose: () => void;
  onIdentify?: (deviceId: string) => void;
  initialDeviceId: string | null;
}

interface Placing {
  deviceId: string;
  /** Adds another surface to the device (a fan chain) instead of moving it. */
  append: boolean;
}

function SceneEditor({
  api, devices, leds, backdrop, onBackdrop, shaderEffect, shaderState, shaderPaused, audioRef,
  onCamera, onClose, onIdentify, initialDeviceId,
}: SceneEditorProps) {
  const { t, language } = useTranslation();
  const scene = api.scene!;
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(initialDeviceId);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [placing, setPlacing] = useState<Placing | null>(null);
  const rendererRef = useRef<SceneRenderer | null>(null);
  const toast = useToastSafe();
  const flash = useCallback((title: string) => toast.push({ title, durationMs: TOAST_MS }), [toast]);

  const placeable = useMemo(() => devices.filter(d => d.controlled !== false && d.ledCount > 0), [devices]);
  const deviceName = useCallback((id: string) => devices.find(d => d.id === id)?.name ?? id, [devices]);
  const objectsById = useMemo(() => new Map(scene.objects.map(o => [o.id, o])), [scene.objects]);
  const bindingOf = useCallback((id: string) => scene.bindings.find(b => b.deviceId === id), [scene.bindings]);

  const whereLabel = useCallback((deviceId: string) => {
    const binding = bindingOf(deviceId);
    if (!binding) return t('lighting.scene.devices.notPlaced');
    return binding.targets.map(tg => {
      const obj = objectsById.get(tg.objectId);
      const anchor = obj?.anchors.find(a => a.id === tg.anchorId);
      return obj && anchor ? anchorLabel(t, obj, anchor) : '';
    }).filter(Boolean).join(', ');
  }, [bindingOf, objectsById, t]);

  const place = useCallback((deviceId: string, objectId: string, anchorId: string, append: boolean) => {
    api.update(s => placeDevice(s, deviceId, objectId, anchorId, append));
    setSelectedDeviceId(deviceId);
    setSelectedObjectId(null);
    setPlacing(null);
  }, [api]);

  const onPick = useCallback((pick: ScenePick | null) => {
    if (pick?.kind === 'anchor') {
      if (placing) {
        place(placing.deviceId, pick.objectId, pick.anchorId, placing.append);
        return;
      }
      const bound = scene.bindings.find(b => b.targets.some(tg => tg.objectId === pick.objectId && tg.anchorId === pick.anchorId));
      if (bound) {
        setSelectedDeviceId(bound.deviceId);
        setSelectedObjectId(pick.objectId);
      } else if (selectedDeviceId && !bindingOf(selectedDeviceId)) {
        place(selectedDeviceId, pick.objectId, pick.anchorId, false);
      } else {
        setSelectedObjectId(pick.objectId);
        setSelectedDeviceId(null);
      }
      return;
    }
    setPlacing(null);
    if (pick?.kind === 'object') {
      setSelectedObjectId(pick.objectId);
      setSelectedDeviceId(null);
    } else {
      setSelectedObjectId(null);
      setSelectedDeviceId(null);
    }
  }, [placing, place, scene.bindings, selectedDeviceId, bindingOf]);

  const onDropDevice = useCallback((deviceId: string, pick: ScenePick | null) => {
    if (pick?.kind === 'anchor') place(deviceId, pick.objectId, pick.anchorId, false);
  }, [place]);

  const onMoveObject = useCallback((objectId: string, position: Vec3) => {
    api.update(s => moveObject(s, objectId, position));
    setSelectedObjectId(objectId);
  }, [api]);

  const addDesk = (kind: DeskKind) => {
    const obj = newDeskObject(kind, scene.objects);
    api.update(s => addObject(s, obj));
    setSelectedObjectId(obj.id);
    setSelectedDeviceId(null);
  };

  const addGenericCase = () => {
    const obj = genericCase(scene.objects);
    api.update(s => addObject(s, obj));
    setSelectedObjectId(obj.id);
  };

  const runAutoPlace = () => {
    const result = autoPlace(scene.objects, scene.bindings, placeable);
    if (result.placed.length === 0) {
      flash(t('lighting.scene.devices.nothingToPlace'));
      return;
    }
    api.update(() => ({ objects: result.objects, bindings: result.bindings }));
    flash(t(pluralKey('lighting.scene.devices.autoPlaced', language, result.placed.length), { count: result.placed.length }));
  };

  const caseObj = scene.objects.find(o => o.kind === 'case');
  const selectedObject = selectedObjectId ? objectsById.get(selectedObjectId) ?? null : null;
  const selectedBinding = selectedDeviceId ? bindingOf(selectedDeviceId) ?? null : null;
  const fov = scene.view.camera?.fov ?? DEFAULT_FOV;

  const hint = placing
    ? t(placing.append ? 'lighting.scene.hint.append' : 'lighting.scene.hint.place', { device: deviceName(placing.deviceId) })
    : selectedObject
      ? t('lighting.scene.hint.object')
      : t('lighting.scene.hint.orbit');

  return (
    <Overlay
      open
      onClose={() => (placing ? setPlacing(null) : onClose())}
      ariaLabel={t('lighting.scene.title')}
      className={styles.editorSurface}
      noBackdropDismiss
    >
      <div className={styles.editorHeader}>
        <Box size={18} strokeWidth={1.8} />
        <div className={styles.editorTitle}>{t('lighting.scene.title')}</div>
        <ExperimentalBadge />
        <div className={styles.editorHeaderSpacer} />
        <Button size="sm" tone="accent" icon={<X size={14} strokeWidth={1.8} />} onClick={onClose}>{t('lighting.scene.done')}</Button>
      </div>
      <div className={styles.editorBody}>
        <div className={styles.editorStage}>
          <div className={styles.editorStageInner}>
            <SceneViewport
              className={styles.viewportLarge}
              scene={scene}
              model={api.model}
              leds={leds}
              selectedDeviceId={selectedDeviceId}
              selectedObjectId={selectedObjectId}
              placing={placing !== null || (selectedDeviceId !== null && !selectedBinding)}
              editable
              backdrop={backdrop}
              shaderEffect={shaderEffect}
              shaderState={shaderState}
              shaderPaused={shaderPaused}
              audioRef={audioRef}
              onPick={onPick}
              onCamera={onCamera}
              onMoveObject={onMoveObject}
              onDropDevice={onDropDevice}
              hoverLabel={pick => sceneHoverLabel(t, scene, devices, pick)}
              rendererRef={rendererRef}
            >
              <div className={styles.overlayTop}>
                <CameraPresets objects={scene.objects} fov={fov} onCamera={cam => onCamera(cam, true)} />
                <BackdropButton value={backdrop} onChange={onBackdrop} />
              </div>
              <div className={styles.overlayBottom}>
                <div className={styles.hint}>{hint}</div>
                {placing && (
                  <Button size="sm" tone="neutral" onClick={() => setPlacing(null)}>{t('lighting.scene.cancel')}</Button>
                )}
              </div>
              {((selectedDeviceId && selectedBinding) || selectedObject) && (
                <div className={styles.floatingInspector} aria-live="polite">
                  {selectedDeviceId && selectedBinding && (
                    <section className={styles.inspectorSection}>
                      <div className={styles.inspectorTitle}>{deviceName(selectedDeviceId)}</div>
                      <div className={styles.sectionNote}>{whereLabel(selectedDeviceId)}</div>
                      <div className={styles.buttonRow}>
                        <Button size="sm" tone="neutral" icon={<RotateCw size={13} strokeWidth={1.8} />} onClick={() => api.update(s => rotateBinding(s, selectedDeviceId))}>{t('lighting.scene.device.rotate')}</Button>
                        <Button size="sm" tone="neutral" icon={<FlipHorizontal2 size={13} strokeWidth={1.8} />} onClick={() => api.update(s => flipBinding(s, selectedDeviceId))}>{t('lighting.scene.device.flip')}</Button>
                        <Button size="sm" tone="neutral" icon={<Move3d size={13} strokeWidth={1.8} />} onClick={() => setPlacing({ deviceId: selectedDeviceId, append: false })}>{t('lighting.scene.device.move')}</Button>
                        <Button size="sm" tone="neutral" icon={<Link size={13} strokeWidth={1.8} />} onClick={() => setPlacing({ deviceId: selectedDeviceId, append: true })}>{t('lighting.scene.device.addSurface')}</Button>
                        {onIdentify && <Button size="sm" tone="neutral" icon={<Zap size={13} strokeWidth={1.8} />} onClick={() => onIdentify(selectedDeviceId)}>{t('lighting.scene.device.identify')}</Button>}
                        <Button size="sm" tone="ghost" icon={<Trash2 size={13} strokeWidth={1.8} />} onClick={() => { api.update(s => unplaceDevice(s, selectedDeviceId)); }}>{t('lighting.scene.device.unplace')}</Button>
                      </div>
                    </section>
                  )}

                  {selectedObject && (
                    <section className={styles.inspectorSection}>
                      <div className={styles.inspectorTitle}>{objectLabel(t, selectedObject)}</div>
                      <div className={styles.sectionNote}>{t('lighting.scene.hint.object')}</div>
                      <div className={styles.buttonRow}>
                        <Button size="sm" tone="neutral" icon={<RotateCcw size={13} strokeWidth={1.8} />} onClick={() => api.update(s => turnObject(s, selectedObject.id, TURN_STEP))}>{t('lighting.scene.object.turnLeft')}</Button>
                        <Button size="sm" tone="neutral" icon={<RotateCw size={13} strokeWidth={1.8} />} onClick={() => api.update(s => turnObject(s, selectedObject.id, -TURN_STEP))}>{t('lighting.scene.object.turnRight')}</Button>
                        {selectedObject.source === 'user' && (
                          <Button size="sm" tone="ghost" icon={<Trash2 size={13} strokeWidth={1.8} />} onClick={() => { api.update(s => removeObject(s, selectedObject.id)); setSelectedObjectId(null); }}>{t('lighting.scene.object.remove')}</Button>
                        )}
                      </div>
                    </section>
                  )}
                </div>
              )}
              {scene.objects.length === 0 && (
                <div className={styles.emptyCard}>
                  <div className={styles.emptyTitle}>{t('lighting.scene.empty.title')}</div>
                  <div className={styles.emptyBody}>{t('lighting.scene.empty.body')}</div>
                </div>
              )}
            </SceneViewport>
          </div>
        </div>

        <div className={styles.sidebar}>
          <section className={styles.section}>
            <div className={styles.sectionTitle}>{t('lighting.scene.pc.title')}</div>
            {caseObj?.source === 'build' ? (
              <>
                <div className={styles.sectionNote}>{t('lighting.scene.pc.imported')}</div>
                {!caseObj.anchors.some(a => a.kind === 'fan') && (
                  <div className={styles.sectionNote}>{t('lighting.scene.pc.noFans')}</div>
                )}
                <div className={styles.buttonRow}>
                  <Button size="sm" tone="neutral" icon={<Box size={13} strokeWidth={1.8} />} onClick={() => requestOpenBuild('/builder')}>{t('lighting.scene.pc.update')}</Button>
                  <Button size="sm" tone="ghost" icon={<Trash2 size={13} strokeWidth={1.8} />} onClick={() => void api.removeImport()}>{t('lighting.scene.pc.remove')}</Button>
                </div>
              </>
            ) : (
              <>
                <div className={styles.sectionNote}>{t(caseObj ? 'lighting.scene.pc.genericNote' : 'lighting.scene.pc.none')}</div>
                <div className={styles.buttonRow}>
                  <Button size="sm" tone="accent" icon={<Box size={13} strokeWidth={1.8} />} onClick={() => requestOpenBuild('/builder')}>{t('lighting.scene.pc.fromBuild')}</Button>
                  {!caseObj && <Button size="sm" tone="neutral" onClick={addGenericCase}>{t('lighting.scene.pc.generic')}</Button>}
                </div>
              </>
            )}
          </section>

          <section className={styles.section}>
            <div className={styles.sectionTitle}>{t('lighting.scene.desk.title')}</div>
            <div className={styles.deskGrid}>
              {DESK_KINDS.map(kind => {
                const Icon = DESK_ICONS[kind];
                return (
                  <button key={kind} type="button" className={styles.deskTile} onClick={() => addDesk(kind)}>
                    <Icon size={18} strokeWidth={1.6} />
                    {t(`lighting.scene.kind.${kind}`)}
                  </button>
                );
              })}
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>{t('lighting.scene.devices.title')}</div>
              <Button size="sm" tone="neutral" icon={<WandSparkles size={13} strokeWidth={1.8} />} onClick={runAutoPlace}>{t('lighting.scene.devices.autoPlace')}</Button>
            </div>
            <div className={styles.sectionNote}>{t('lighting.scene.devices.note')}</div>
            <div className={styles.deviceList}>
              {placeable.map(d => {
                const placed = !!bindingOf(d.id);
                const active = d.id === selectedDeviceId || d.id === placing?.deviceId;
                return (
                  <div
                    key={d.id}
                    role="button"
                    tabIndex={0}
                    className={`${styles.deviceRow} ${active ? styles.deviceRowActive : ''}`}
                    draggable
                    onDragStart={e => {
                      e.dataTransfer.setData(DEVICE_DRAG_TYPE, d.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onClick={() => {
                      setSelectedObjectId(null);
                      setSelectedDeviceId(d.id);
                      setPlacing(placed ? null : { deviceId: d.id, append: false });
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedDeviceId(d.id);
                        setPlacing(placed ? null : { deviceId: d.id, append: false });
                      }
                    }}
                  >
                    <span className={`${styles.deviceDot} ${placed ? styles.deviceDotPlaced : ''}`} />
                    <span className={styles.deviceText}>
                      <span className={styles.deviceName}>{d.name}</span>
                      <span className={styles.deviceWhere}>{whereLabel(d.id)}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

        </div>
      </div>
    </Overlay>
  );
}
