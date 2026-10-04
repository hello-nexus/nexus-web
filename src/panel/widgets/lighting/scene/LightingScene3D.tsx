import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Box, Eye, FlipHorizontal2, Info, MapPin, Move3d, Paintbrush, Power, PowerOff, RotateCcw, RotateCw, X, Zap } from 'lucide-react';
import { identifyLightingDevice, type LightingDevice } from '../../../../api/lighting';
import type { SceneBinding, SceneCamera, SceneObject, Vec3 } from '../../../../api/lightingScene';
import type { AudioSnapshot } from '../../../../hooks/useAudioState';
import type { EffectState } from '../../../../types/lighting';
import { Button } from '../../../../components/common/Button/Button';
import { DeviceContextMenu, menuSections } from '../../../../components/common/DeviceCanvas/DeviceContextMenu';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
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
import { menuDevices, mirrorGroup, moveObject, placeDevice, rotateBinding } from './sceneEdits';
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
  /** Opens a device's LED map editor, from its right-click menu as on the 2D canvas. */
  onOpenSettings?: (deviceId: string) => void;
  onSetDevicesPower?: (deviceIds: string[], on: boolean) => void;
}

const PRESETS: CameraPreset[] = ['front', 'angle', 'side', 'top'];
const TOAST_MS = 2600;
// Long enough to find the blinking device on the desk before it stops.
const BLINK_MS = 4000;
// Least space between the centred camera buttons and the bar's ends.
const FIT_GAP_PX = 8;

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
}

/**
 * The 3D view in place of the 2D canvas. A click selects (here and in the device list), a drag moves or turns the
 * selection the way Build does, and Place devices walks the unplaced devices onto their spots, each one blinking so
 * it can be found on the desk. What is on the desk comes from Build.
 */
export default function LightingScene3D({
  api, devices, selectedDeviceId, onSelectDevice, shaderEffect, shaderState, shaderPaused, audioRef,
  startPlacing, onPlacingStarted, onLayoutCommit, onOpenSettings, onSetDevicesPower,
}: LightingScene3DProps) {
  const { t, language } = useTranslation();
  const leds = useSceneLeds(api, devices);
  const scene = api.scene;
  const toast = useToastSafe();
  const flash = useCallback((title: string) => toast.push({ title, durationMs: TOAST_MS }), [toast]);
  const [placing, setPlacing] = useState<Placing | null>(null);
  // Walking through every unplaced device, one blink and click at a time; skipped ones are not offered again.
  const [guided, setGuided] = useState(false);
  // A right-clicked device's menu, at the click (client pixels).
  const [menu, setMenu] = useState<{ deviceIds: string[]; x: number; y: number } | null>(null);
  // The object carrying the move tool: the one clicked, or the one the device picked in the list sits on.
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const skipped = useRef(new Set<string>());

  const placeable = useMemo(() => devices.filter(d => d.controlled !== false && d.ledCount > 0), [devices]);
  const bindingOf = useCallback((id: string) => scene?.bindings.find(b => b.deviceId === id), [scene?.bindings]);
  const unplaced = useMemo(() => placeable.filter(d => !bindingOf(d.id)), [placeable, bindingOf]);
  const deviceName = useCallback((id: string) => devices.find(d => d.id === id)?.name ?? id, [devices]);
  const bar = useCenteredFit();

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
    setPlacing({ deviceId: next.id });
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
    if (unplaced.length > 0) startGuide();
  }, [startPlacing, scene, unplaced.length, startGuide, onPlacingStarted]);

  // A device picked in the list selects the object it sits on when it is that object's only device (a keyboard);
  // a fan on the case lights its spot instead of selecting the whole case.
  const homeOf = selectedDeviceId ? bindingOf(selectedDeviceId)?.targets[0]?.objectId ?? null : null;
  const selectedHome = homeOf && scene?.bindings.filter(b => b.targets.some(tg => tg.objectId === homeOf)).length === 1 ? homeOf : null;
  useEffect(() => {
    if (selectedHome) setSelectedObjectId(selectedHome);
  }, [selectedHome]);

  // A device picked in the list that has no spot yet is waiting for one.
  const waiting = useMemo<Placing | null>(() => placing ?? (selectedDeviceId && !bindingOf(selectedDeviceId) && placeable.some(d => d.id === selectedDeviceId)
    ? { deviceId: selectedDeviceId } : null), [placing, selectedDeviceId, bindingOf, placeable]);

  const place = useCallback((p: Placing, objectId: string, anchorId: string) => {
    api.update(s => placeDevice(s, p.deviceId, objectId, anchorId, false));
    if (guided) {
      offerNext(new Set([p.deviceId]));
      return;
    }
    setPlacing(null);
    onSelectDevice(p.deviceId);
  }, [api, guided, offerNext, onSelectDevice]);

  // A click selects what it lands on, here and in the list: a spot's device, or an object and the one device on it.
  const onPick = useCallback((pick: ScenePick | null) => {
    if (!scene) return;
    if (pick?.kind === 'anchor' && waiting) {
      place(waiting, pick.objectId, pick.anchorId);
      return;
    }
    setSelectedObjectId(pick?.objectId ?? null);
    if (pick?.kind === 'anchor') {
      const bound = scene.bindings.find(b => onSpot(b, pick));
      onSelectDevice(bound?.deviceId ?? null);
      return;
    }
    if (!guided) setPlacing(null);
    const onObject = pick ? scene.bindings.filter(b => b.targets.some(tg => tg.objectId === pick.objectId)) : [];
    onSelectDevice(onObject.length === 1 ? onObject[0].deviceId : null);
  }, [scene, waiting, place, guided, onSelectDevice]);

  const onMoveObject = useCallback((objectId: string, position: Vec3, yaw: number) => {
    api.update(s => moveObject(s, objectId, position, yaw));
  }, [api]);

  useEffect(() => {
    if (!placing && !guided) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') stopGuide(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placing, guided, stopGuide]);

  // A one-device menu also selects that device in the list.
  const onContextMenu = useCallback((pick: ScenePick, x: number, y: number) => {
    if (!scene) return;
    const ids = menuDevices(scene.bindings, pick, selectedDeviceId);
    if (ids.length === 0) return;
    if (ids.length === 1) onSelectDevice(ids[0]);
    setSelectedObjectId(pick.objectId);
    setMenu({ deviceIds: ids, x, y });
  }, [scene, selectedDeviceId, onSelectDevice]);

  if (!scene) return <div className={styles.viewport} />;
  const fov = scene.view.camera?.fov ?? DEFAULT_FOV;
  const empty = scene.objects.length === 0;
  const caseObj = scene.objects.find(o => o.kind === 'case');

  const help = [
    'lighting.scene.help.camera', 'lighting.scene.help.select', 'lighting.scene.help.spot',
    'lighting.scene.help.list', 'lighting.scene.help.build', 'lighting.scene.help.lights',
    ...(caseObj && !caseObj.anchors.some(a => a.kind === 'fan') ? ['lighting.scene.pc.noFans'] : []),
  ];

  return (
    <SceneViewport
      scene={scene}
      model={api.model}
      leds={leds}
      selectedDeviceId={selectedDeviceId}
      placing={waiting !== null}
      selectedObjectId={selectedObjectId}
      shaderEffect={shaderEffect}
      shaderState={shaderState}
      shaderPaused={shaderPaused}
      audioRef={audioRef}
      onPick={onPick}
      onMoveObject={onMoveObject}
      onContextMenu={onContextMenu}
      onCamera={onCamera}
      hoverLabel={pick => sceneHoverLabel(t, scene, devices, pick)}
    >
      <div ref={bar.bar} className={styles.overlayTop}>
        <div ref={bar.left} className={styles.topLeft}>
          <Button size="sm" tone="neutral" icon={<Box size={13} strokeWidth={1.8} />} onClick={() => requestOpenBuild('/builder')}>
            {t('lighting.scene.pc.update')}
          </Button>
          {!empty && unplaced.length > 0 && !guided && (
            <Button size="sm" tone="neutral" icon={<MapPin size={13} strokeWidth={1.8} />} onClick={startGuide}>
              {t('lighting.scene.place.start')}
              <span className={styles.countBadge}>{unplaced.length}</span>
            </Button>
          )}
        </div>
        <div ref={bar.center} className={styles.topCenter} data-hidden={!bar.fits || undefined}>
          <div className={styles.pillGroup} role="group" aria-label={t('lighting.scene.camera.label')}>
            {PRESETS.map(p => (
              <button key={p} type="button" className={styles.pillButton} tabIndex={bar.fits ? undefined : -1} onClick={() => onCamera(presetCamera(scene.objects, p, fov), true)}>
                {t(`lighting.scene.camera.${p}`)}
              </button>
            ))}
          </div>
        </div>
        <div ref={bar.right} className={styles.topRight}>
          <HoverTooltip
            side="left"
            body={(
              <ul className={styles.helpList}>
                {help.map(key => <li key={key}>{t(key)}</li>)}
              </ul>
            )}
          >
            <Button size="sm" tone="ghost" icon={<Info size={16} />} aria-label={t('lighting.scene.help.label')} />
          </HoverTooltip>
        </div>
      </div>

      {menu && (() => {
        const targets = devices.filter(d => menu.deviceIds.includes(d.id) && bindingOf(d.id));
        if (targets.length === 0) return null;
        const ids = targets.map(d => d.id);
        const count = targets.length;
        const group = count > 1;
        const counted = (single: string, plural: string, n: number) => (group ? t(pluralKey(plural, language, n), { count: n }) : t(single));
        const anyOn = targets.some(d => d.ledsOn);
        const ledTargets = targets.filter(d => d.ledCount > 0);
        const items = menuSections(
          onOpenSettings && !group ? [{ key: 'settings', icon: <Paintbrush size={14} />, label: t('lighting.ledMap.settings'), onSelect: () => onOpenSettings(ids[0]) }] : [],
          [
            { key: 'rotate-cw', icon: <RotateCw size={14} />, label: counted('lighting.devices.rotateCw', 'lighting.devices.rotateCwCount', count), onSelect: () => api.update(s => ids.reduce((acc, id) => rotateBinding(acc, id, 1), s)) },
            { key: 'rotate-ccw', icon: <RotateCcw size={14} />, label: counted('lighting.devices.rotateCcw', 'lighting.devices.rotateCcwCount', count), onSelect: () => api.update(s => ids.reduce((acc, id) => rotateBinding(acc, id, -1), s)) },
            { key: 'mirror', icon: <FlipHorizontal2 size={14} />, label: counted('lighting.devices.mirror', 'lighting.devices.mirrorCount', count), onSelect: () => api.update(s => mirrorGroup(s, ids)) },
            ...(group ? [] : [{ key: 'move', icon: <Move3d size={14} />, label: t('lighting.scene.device.move'), onSelect: () => setPlacing({ deviceId: ids[0] }) }]),
          ],
          onSetDevicesPower ? [{
            key: 'power', icon: anyOn ? <PowerOff size={14} /> : <Power size={14} />,
            label: anyOn ? counted('lighting.devices.menuLightsOff', 'lighting.devices.menuLightsOffCount', count) : counted('lighting.devices.menuLightsOn', 'lighting.devices.menuLightsOnCount', count),
            onSelect: () => onSetDevicesPower(ids, !anyOn),
          }] : [],
          ledTargets.length > 0 ? [{ key: 'identify', icon: <Eye size={14} />, label: counted('lighting.devices.identify', 'lighting.devices.identifyCount', ledTargets.length), onSelect: () => ledTargets.forEach(d => blink(d.id)) }] : [],
        );
        return <DeviceContextMenu key={`${ids.join(',')}:${menu.x}:${menu.y}`} x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />;
      })()}

      {empty ? (
        <div className={styles.emptyCard}>
          <div className={styles.emptyTitle}>{t('lighting.scene.empty.title')}</div>
          <div className={styles.emptyBody}>{t('lighting.scene.empty.build')}</div>
          <Button size="md" tone="accent" icon={<Box size={14} strokeWidth={1.8} />} onClick={() => requestOpenBuild('/builder')}>
            {t('lighting.scene.pc.fromBuild')}
          </Button>
        </div>
      ) : waiting && (
        <div className={styles.overlayBottom} aria-live="polite">
          <div className={styles.hint}>
            {t(guided ? 'lighting.scene.place.blinking' : 'lighting.scene.hint.place', { device: deviceName(waiting.deviceId) })}
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
      )}
    </SceneViewport>
  );
}

/** Whether the camera buttons fit centred between the bar's two ends; they hide rather than crowd them. */
function useCenteredFit() {
  const bar = useRef<HTMLDivElement>(null);
  const left = useRef<HTMLDivElement>(null);
  const center = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLDivElement>(null);
  const [fits, setFits] = useState(true);
  useLayoutEffect(() => {
    const els = [bar.current, left.current, center.current, right.current];
    if (els.some(e => !e)) return undefined;
    const measure = () => {
      const [b, l, c, r] = els.map(e => e!.getBoundingClientRect().width);
      setFits((b - c) / 2 >= Math.max(l, r) + FIT_GAP_PX);
    };
    const observer = new ResizeObserver(measure);
    els.forEach(e => observer.observe(e!));
    measure();
    return () => observer.disconnect();
  }, []);
  return { bar, left, center, right, fits };
}
