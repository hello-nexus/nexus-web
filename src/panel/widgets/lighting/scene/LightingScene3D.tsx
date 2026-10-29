import { useCallback, useMemo, useState, type RefObject } from 'react';
import { Box, Eye, EyeOff, Zap } from 'lucide-react';
import type { LightingDevice } from '../../../../api/lighting';
import type { SceneCamera, SceneObject } from '../../../../api/lightingScene';
import type { AudioSnapshot } from '../../../../hooks/useAudioState';
import type { EffectState } from '../../../../types/lighting';
import { Button } from '../../../../components/common/Button/Button';
import { useTranslation } from '../../../../lib/i18n';
import { ledWorldPositions, placements } from '../../../../lib/scene/sceneMath';
import { DEFAULT_FOV, presetCamera, type CameraPreset } from '../../../../lib/scene/scenePresets';
import type { ScenePick } from '../../../../lib/scene/sceneRenderer';
import { requestOpenBuild } from '../../../../components/views/BuildPage/buildNav';
import { SceneViewport, type Backdrop } from './SceneViewport';
import { anchorLabel, objectLabel } from './sceneLabels';
import { deviceForPick, pickForStack } from '../../../../lib/scene/pickDevice';
import { useSceneLedMaps, type LightingSceneApi } from './useLightingScene';
import styles from './Scene.module.scss';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';

export interface LightingScene3DProps {
  api: LightingSceneApi;
  devices: LightingDevice[];
  selectedDeviceId: string | null;
  onSelectDevice: (id: string | null) => void;
  shaderEffect: string | null;
  shaderState: EffectState | null;
  shaderPaused?: boolean;
  audioRef?: RefObject<AudioSnapshot | null>;
  onIdentify?: (deviceId: string) => void;
  /** After a camera commit, so the active layout preset can save it. */
  onLayoutCommit?: () => void;
}

const PRESETS: CameraPreset[] = ['front', 'angle', 'side', 'top'];

const BACKDROP_NEXT: Record<Backdrop, Backdrop> = { dim: 'full', full: 'off', off: 'dim' };

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

/** The hover chip's text: who sits on a spot, or an object's name; nothing for a free spot. */
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
  if (names.length === 0) return null;
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
    <HoverTooltip body={t(`lighting.scene.backdrop.${value}`)}>
      <button
        type="button"
        className={styles.iconButton}
        onClick={() => onChange(BACKDROP_NEXT[value])}
        aria-label={t(`lighting.scene.backdrop.${value}`)}
      >
        {value === 'off' ? <EyeOff size={15} strokeWidth={1.6} /> : <Eye size={15} strokeWidth={1.6} />}
      </button>
    </HoverTooltip>
  );
}

export default function LightingScene3D({
  api, devices, selectedDeviceId, onSelectDevice, shaderEffect, shaderState, shaderPaused, audioRef,
  onIdentify, onLayoutCommit,
}: LightingScene3DProps) {
  const { t } = useTranslation();
  const leds = useSceneLeds(api, devices);
  const [backdrop, setBackdrop] = useState<Backdrop>('dim');
  const scene = api.scene;

  const deviceName = useCallback((id: string) => devices.find(d => d.id === id)?.name ?? id, [devices]);

  const onCamera = useCallback((cam: SceneCamera, final: boolean) => {
    const saved = api.setCamera(cam, final);
    // The active preset snapshots the saved view, so it saves only once the camera has landed.
    if (final) void saved.then(() => onLayoutCommit?.());
  }, [api, onLayoutCommit]);

  // The scene is read-only here: a click selects the device it shows, and placing happens in Build.
  const onPick = useCallback((_rawPick: ScenePick | null, stack: ScenePick[]) => {
    if (!scene) return;
    const bound = deviceForPick(scene.bindings, pickForStack(scene.bindings, stack));
    if (bound) onSelectDevice(bound);
  }, [scene, onSelectDevice]);

  if (!scene) return <div className={styles.viewport} />;

  const noItems = scene.objects.length === 0;
  const selectedBound = selectedDeviceId !== null && scene.bindings.some(b => b.deviceId === selectedDeviceId);
  const fov = scene.view.camera?.fov ?? DEFAULT_FOV;

  return (
    <div className={styles.inlineLayout}>
      <SceneViewport
        className={styles.viewportInline}
        scene={scene}
        model={api.model}
        caseScene={api.caseScene}
        leds={leds}
        selectedDeviceId={selectedDeviceId}
        backdrop={backdrop}
        shaderEffect={shaderEffect}
        shaderState={shaderState}
        shaderPaused={shaderPaused}
        audioRef={audioRef}
        onPick={onPick}
        onCamera={onCamera}
        hoverLabel={(pick, stack) => sceneHoverLabel(t, scene, devices, pickForStack(scene.bindings, stack) ?? pick)}
        publishPoints
      >
        <div className={styles.overlayTop}>
          <CameraPresets objects={scene.objects} fov={fov} onCamera={cam => onCamera(cam, true)} />
          <BackdropButton value={backdrop} onChange={setBackdrop} />
          <Button size="sm" tone="neutral" icon={<Box size={13} strokeWidth={1.8} />} onClick={() => requestOpenBuild('/builder')}>
            {t('lighting.scene.pc.update')}
          </Button>
        </div>
        <div className={styles.overlayBottom}>
          <div className={styles.hint}>{t('lighting.scene.hint.orbit')}</div>
        </div>
        {selectedBound && selectedDeviceId && onIdentify && (
          <div className={styles.floatingInspector} aria-live="polite">
            <section className={styles.inspectorSection}>
              <div className={styles.inspectorTitle}>{deviceName(selectedDeviceId)}</div>
              <div className={styles.buttonRow}>
                <Button size="sm" tone="neutral" icon={<Zap size={13} strokeWidth={1.8} />} onClick={() => onIdentify(selectedDeviceId)}>{t('lighting.scene.device.identify')}</Button>
              </div>
            </section>
          </div>
        )}
        {noItems && (
          <div className={styles.emptyCard}>
            <div className={styles.emptyTitle}>{t('lighting.scene.empty.title')}</div>
            <div className={styles.emptyBody}>{t('lighting.scene.empty.noItems')}</div>
            <Button size="md" tone="accent" icon={<Box size={14} strokeWidth={1.8} />} onClick={() => requestOpenBuild('/builder')}>
              {t('lighting.scene.pc.fromBuild')}
            </Button>
          </div>
        )}
      </SceneViewport>
    </div>
  );
}
