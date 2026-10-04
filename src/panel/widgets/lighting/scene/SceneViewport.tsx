import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { AudioSnapshot } from '../../../../hooks/useAudioState';
import { useShaderRenderer } from '../../../../hooks/useShaderRenderer';
import type { LightingScene, SceneCamera, Vec3 } from '../../../../api/lightingScene';
import type { EffectState } from '../../../../types/lighting';
import { CanvasBackground } from '../../../../components/common/DeviceCanvas/DeviceCanvas';
import { SceneRenderer, type ScenePick, type SceneTheme } from '../../../../lib/scene/sceneRenderer';
import { setScenePoints } from '../../../../lib/scene/scenePointsStore';
import { useTranslation } from '../../../../lib/i18n';
import styles from './Scene.module.scss';

/** The drag payload a device row carries onto the viewport. */
export const DEVICE_DRAG_TYPE = 'application/x-nexus-device';

export type Backdrop = 'full' | 'dim' | 'off';

interface SceneViewportProps {
  scene: LightingScene;
  model: ArrayBuffer | null;
  leds: Map<string, Float32Array>;
  selectedDeviceId: string | null;
  selectedObjectId: string | null;
  placing: boolean;
  editable: boolean;
  backdrop: Backdrop;
  shaderEffect: string | null;
  shaderState: EffectState | null;
  shaderPaused?: boolean;
  audioRef?: RefObject<AudioSnapshot | null>;
  onPick: (pick: ScenePick | null) => void;
  onCamera: (camera: SceneCamera, final: boolean) => void;
  onMoveObject?: (objectId: string, position: Vec3) => void;
  onDropDevice?: (deviceId: string, pick: ScenePick | null) => void;
  /** Feed the device cards' readouts with where the camera puts each LED. */
  publishPoints?: boolean;
  rendererRef?: { current: SceneRenderer | null };
  className?: string;
  children?: ReactNode;
}

// The canvas 2D context normalises any CSS colour syntax to one three.js parses.
function cssColor(el: Element, name: string, fallback: string): string {
  const ctx = document.createElement('canvas').getContext('2d');
  const raw = getComputedStyle(el).getPropertyValue(name).trim();
  if (!ctx) return fallback;
  ctx.fillStyle = fallback;
  if (raw) ctx.fillStyle = raw;
  return String(ctx.fillStyle).replace(/^rgba\((.*),[^,]*\)$/, 'rgb($1)');
}

export function SceneViewport({
  scene, model, leds, selectedDeviceId, selectedObjectId, placing, editable, backdrop,
  shaderEffect, shaderState, shaderPaused, audioRef,
  onPick, onCamera, onMoveObject, onDropDevice, publishPoints, rendererRef, className, children,
}: SceneViewportProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const rendererInst = useRef<SceneRenderer | null>(null);
  const [failed, setFailed] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const shaderStateRef = useRef(shaderState);
  shaderStateRef.current = shaderState;
  const { ready } = useShaderRenderer(glCanvasRef, backdrop === 'off' ? null : shaderEffect, shaderStateRef, audioRef, undefined, shaderPaused);

  // Latest callbacks, read by the renderer without rebuilding it.
  const handlers = useRef({ onPick, onCamera, onMoveObject, publishPoints });
  handlers.current = { onPick, onCamera, onMoveObject, publishPoints };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return undefined;
    const theme: SceneTheme = {
      accent: cssColor(container, '--accent', '#4da3ff'),
      line: '#e6e9ee',
      face: '#8b95a5',
      desk: '#1b1f26',
    };
    let renderer: SceneRenderer;
    try {
      renderer = new SceneRenderer(canvas, {
        onCamera: (cam, final) => handlers.current.onCamera(cam, final),
        onPick: pick => handlers.current.onPick(pick),
        onMoveObject: (id, pos) => handlers.current.onMoveObject?.(id, pos),
        onProjected: points => { if (handlers.current.publishPoints) setScenePoints(points); },
      }, theme);
    } catch {
      setFailed(true);
      return undefined;
    }
    rendererInst.current = renderer;
    if (rendererRef) rendererRef.current = renderer;
    return () => {
      renderer.dispose();
      rendererInst.current = null;
      if (rendererRef) rendererRef.current = null;
      if (handlers.current.publishPoints) setScenePoints(null);
    };
  }, [rendererRef]);

  useEffect(() => {
    void rendererInst.current?.setModel(model).catch(() => { /* a broken model leaves the case drawn as its box */ });
  }, [model]);

  useEffect(() => {
    rendererInst.current?.setState({
      objects: scene.objects,
      bindings: scene.bindings,
      leds,
      selectedDeviceId,
      selectedObjectId,
      placing,
      dropTarget,
      editable,
    });
  }, [scene.objects, scene.bindings, leds, selectedDeviceId, selectedObjectId, placing, dropTarget, editable]);

  const camera = scene.view.camera;
  useEffect(() => {
    if (camera) rendererInst.current?.setCamera(camera);
  }, [camera]);

  const dropKey = (pick: ScenePick | null) => (pick?.kind === 'anchor' ? `${pick.objectId}\n${pick.anchorId}` : null);

  return (
    <div
      ref={containerRef}
      className={`${styles.viewport} ${className ?? ''}`}
      onDragOver={e => {
        if (!onDropDevice || !e.dataTransfer.types.includes(DEVICE_DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const key = dropKey(rendererInst.current?.pickAt(e.clientX, e.clientY) ?? null);
        if (key !== dropTarget) setDropTarget(key);
      }}
      onDragLeave={() => setDropTarget(null)}
      onDrop={e => {
        const id = e.dataTransfer.getData(DEVICE_DRAG_TYPE);
        setDropTarget(null);
        if (!id || !onDropDevice) return;
        e.preventDefault();
        onDropDevice(id, rendererInst.current?.pickAt(e.clientX, e.clientY) ?? null);
      }}
    >
      <div className={styles.backdrop} data-backdrop={backdrop}>
        <CanvasBackground />
        <canvas ref={glCanvasRef} className={`${styles.glBackdrop} ${ready ? styles.glBackdropReady : ''}`} />
      </div>
      <canvas ref={canvasRef} className={styles.three} />
      {failed && <div className={styles.webglFailed}>{t('lighting.scene.webglFailed')}</div>}
      {children}
    </div>
  );
}
