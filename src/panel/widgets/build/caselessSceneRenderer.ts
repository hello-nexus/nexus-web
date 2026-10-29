import { Group, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import type { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { buildCase, disposeGroup, scenePalette, type SceneLayout } from '../../../lib/scene/pcScene';

// Slow enough to read as ambient, fast enough to show the depth of the parts.
const TURN_RAD_PER_S = 0.22;
const FRAME_MS = 1000 / 30;
const FRAME_SLACK_MS = 3;
const VIEW_DIRECTION = new Vector3(-0.9, 0.7, -1.3).normalize();
const FIT_MARGIN = 1.12;
const FOV = 32;

export interface CaselessSceneStats {
  frames: number;
  /** Mean CPU time of one render call, milliseconds. */
  meanRenderMs: number;
}

export interface CaselessSceneRenderer {
  setLayout: (layout: SceneLayout) => void;
  /** Rebuilds the current layout with the palette the host's theme tokens now give. */
  refreshPalette: () => void;
  resize: () => void;
  stats: () => CaselessSceneStats;
  dispose: () => void;
}

/** Draws a layout with the shared Build scene, turning slowly, at a capped rate; idle while hidden, offscreen, or under reduced motion. */
export function createCaselessSceneRenderer(canvas: HTMLCanvasElement): CaselessSceneRenderer {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 1, 20000);
  const turner = new Group();
  scene.add(turner);
  const materials: LineMaterial[] = [];
  let layout: SceneLayout | null = null;
  let frame = 0;
  let angle = 0;
  let lastTick = 0;
  let lastDraw = 0;
  let drawn = 0;
  let renderMs = 0;
  let onScreen = true;
  const motion = typeof matchMedia === 'undefined' ? null : matchMedia('(prefers-reduced-motion: reduce)');

  const animating = () => !document.hidden && onScreen && !motion?.matches;

  const tick = (now: number) => {
    frame = 0;
    const dt = lastTick ? Math.min((now - lastTick) / 1000, 0.1) : 0;
    lastTick = now;
    if (now - lastDraw < FRAME_MS - FRAME_SLACK_MS) {
      request();
      return;
    }
    lastDraw = now;
    if (!motion?.matches) angle += dt * TURN_RAD_PER_S;
    turner.rotation.y = angle;
    const start = performance.now();
    renderer.render(scene, camera);
    renderMs += performance.now() - start;
    drawn += 1;
    if (animating()) request();
    else lastTick = 0;
  };
  const request = () => {
    if (!frame) frame = requestAnimationFrame(tick);
  };

  const onVisibility = () => { if (!document.hidden) request(); };
  document.addEventListener('visibilitychange', onVisibility);
  const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
    onScreen = entries[entries.length - 1].isIntersecting;
    if (onScreen) request();
  });
  observer?.observe(canvas);

  const fit = (l: SceneLayout) => {
    const [d, w, h] = l.size;
    const radius = Math.hypot(d, w, h) / 2;
    const dist = (radius * FIT_MARGIN) / Math.sin((FOV * Math.PI) / 360);
    camera.position.copy(VIEW_DIRECTION).multiplyScalar(dist);
    camera.lookAt(0, 0, 0);
  };

  const clear = () => {
    turner.children.forEach(child => disposeGroup(child as Group));
    turner.clear();
    materials.length = 0;
  };

  const rebuild = () => {
    if (!layout) return;
    clear();
    // A static view: no fan-slot ghosts, limit planes or picking layer.
    turner.add(buildCase(layout, scenePalette(canvas), materials, [], [], true, false));
    materials.forEach(m => m.resolution.set(canvas.clientWidth, canvas.clientHeight));
    fit(layout);
    request();
  };

  return {
    setLayout(next) {
      layout = next;
      rebuild();
    },
    refreshPalette: rebuild,
    resize() {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      materials.forEach(m => m.resolution.set(w, h));
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      request();
    },
    stats: () => ({ frames: drawn, meanRenderMs: drawn ? renderMs / drawn : 0 }),
    dispose() {
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
      observer?.disconnect();
      clear();
      renderer.forceContextLoss();
      renderer.dispose();
    },
  };
}
