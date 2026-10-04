import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { AudioSnapshot } from '../../../../hooks/useAudioState';
import { useShaderRenderer } from '../../../../hooks/useShaderRenderer';
import type { LightingScene, SceneCamera, SceneModel, Vec3 } from '../../../../api/lightingScene';
import type { EffectState } from '../../../../types/lighting';
import { CanvasBackground } from '../../../../components/common/DeviceCanvas/DeviceCanvas';
import { SceneRenderer, type ScenePick } from '../../../../lib/scene/sceneRenderer';
import { setScenePoints } from '../../../../lib/scene/scenePointsStore';
import { readPalette } from '../../../../lib/scene/wireframe';
import { useTranslation } from '../../../../lib/i18n';
import styles from './Scene.module.scss';

interface SceneViewportProps {
  scene: LightingScene;
  model: SceneModel | null;
  leds: Map<string, Float32Array>;
  selectedDeviceId: string | null;
  placing: boolean;
  /** Edit scene mode: click an object to select it, drag it to move or turn it. */
  editing: boolean;
  shaderEffect: string | null;
  shaderState: EffectState | null;
  shaderPaused?: boolean;
  audioRef?: RefObject<AudioSnapshot | null>;
  /** A click, with where it landed in the viewport (CSS pixels from its top left). */
  onPick: (pick: ScenePick | null, x: number, y: number) => void;
  onMoveObject: (objectId: string, position: Vec3, yaw: number) => void;
  onCamera: (camera: SceneCamera, final: boolean) => void;
  /** Names what the pointer rests on, shown as a chip beside it; null shows nothing. */
  hoverLabel?: (pick: ScenePick) => string | null;
  children?: ReactNode;
}

/** The 3D scene over the effect it samples: the effect plays behind, so each LED dot shows the colour it gets. */
export function SceneViewport({
  scene, model, leds, selectedDeviceId, placing, editing, shaderEffect, shaderState, shaderPaused, audioRef,
  onPick, onMoveObject, onCamera, hoverLabel, children,
}: SceneViewportProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const threeHostRef = useRef<HTMLDivElement>(null);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const rendererInst = useRef<SceneRenderer | null>(null);
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState<{ text: string; x: number; y: number } | null>(null);
  const shaderStateRef = useRef(shaderState);
  shaderStateRef.current = shaderState;
  const { ready } = useShaderRenderer(glCanvasRef, shaderEffect, shaderStateRef, audioRef, undefined, shaderPaused);

  // Latest callbacks, read by the renderer without rebuilding it.
  const handlers = useRef({ onPick, onMoveObject, onCamera, hoverLabel });
  handlers.current = { onPick, onMoveObject, onCamera, hoverLabel };

  useEffect(() => {
    const host = threeHostRef.current;
    const container = containerRef.current;
    if (!host || !container) return undefined;
    let renderer: SceneRenderer;
    try {
      renderer = new SceneRenderer(host, {
        onCamera: (cam, final) => handlers.current.onCamera(cam, final),
        onPick: (pick, clientX, clientY) => {
          const rect = container.getBoundingClientRect();
          handlers.current.onPick(pick, clientX - rect.left, clientY - rect.top);
        },
        onMoveObject: (id, position, yaw) => handlers.current.onMoveObject(id, position, yaw),
        onProjected: points => setScenePoints(points),
        onHover: (pick, clientX, clientY) => {
          const text = pick ? handlers.current.hoverLabel?.(pick) ?? null : null;
          const rect = container.getBoundingClientRect();
          setHover(text ? { text, x: clientX - rect.left, y: clientY - rect.top } : null);
        },
      }, readPalette(container));
    } catch {
      setFailed(true);
      return undefined;
    }
    rendererInst.current = renderer;
    return () => {
      renderer.dispose();
      rendererInst.current = null;
      setScenePoints(null);
    };
  }, []);

  useEffect(() => {
    rendererInst.current?.setModel(model);
  }, [model]);

  useEffect(() => {
    rendererInst.current?.setState({ objects: scene.objects, bindings: scene.bindings, leds, selectedDeviceId, placing, editing });
  }, [scene.objects, scene.bindings, leds, selectedDeviceId, placing, editing]);

  const camera = scene.view.camera;
  useEffect(() => {
    if (camera) rendererInst.current?.setCamera(camera);
  }, [camera]);

  return (
    <div ref={containerRef} className={styles.viewport} data-theme="dark">
      <div className={styles.backdrop}>
        <CanvasBackground />
        <canvas ref={glCanvasRef} className={`${styles.glBackdrop} ${ready ? styles.glBackdropReady : ''}`} />
      </div>
      <div ref={threeHostRef} className={styles.three} />
      {failed && <div className={styles.webglFailed}>{t('lighting.scene.webglFailed')}</div>}
      {hover && <div className={styles.hoverChip} style={{ left: hover.x, top: hover.y }}>{hover.text}</div>}
      {children}
    </div>
  );
}
