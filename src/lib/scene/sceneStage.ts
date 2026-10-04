import { type Object3D, PerspectiveCamera, Raycaster, Scene, Vector2, Vector3, WebGLRenderer, type Intersection } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { LineMaterial } from 'three/addons/lines/LineMaterial.js';

export interface StageOptions {
  fov: number;
  near: number;
  far: number;
  /** A fixed camera aspect (the host is styled to it); omitted, the aspect follows the host. */
  aspect?: number;
}

/**
 * One WebGL view with orbit controls: left drag orbits, right drag pans (within a limit), the wheel zooms. Draws on
 * demand, at most once per animation frame, never in a loop. Both the Build portal's PC view and the Lighting
 * page's scene draw through it.
 */
export class SceneStage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly canvas: HTMLCanvasElement;
  /** Runs before each draw; a layer that animates per frame (LED dots) updates here. */
  beforeRender: (() => void) | null = null;

  private readonly host: HTMLElement;
  private readonly aspect: number | undefined;
  private readonly lines = new Set<LineMaterial>();
  private readonly resolution = new Vector2(1, 1);
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly panCentre = new Vector3();
  private readonly excess = new Vector3();
  private panLimit = Number.POSITIVE_INFINITY;
  private frame: number | null = null;
  private readonly observer: ResizeObserver;
  private disposed = false;

  /** Throws when the browser gives no WebGL context. */
  constructor(host: HTMLElement, options: StageOptions) {
    this.host = host;
    this.aspect = options.aspect;
    // A fresh canvas per stage: dispose force-loses its context, and a reused element would hand that dead context on.
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
    this.renderer = new WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    host.appendChild(this.canvas);
    this.camera = new PerspectiveCamera(options.fov, options.aspect ?? 1, options.near, options.far);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.screenSpacePanning = true;
    this.controls.addEventListener('change', this.onControlsChange);
    // A right press opens the context menu on mousedown on macOS, which ends the pan drag before it starts.
    this.canvas.addEventListener('contextmenu', this.preventMenu);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
  }

  /** Fat-line materials take the viewport size to draw their widths in pixels. */
  trackLines(materials: Iterable<LineMaterial>): void {
    for (const m of materials) {
      m.resolution.copy(this.resolution);
      this.lines.add(m);
    }
  }

  untrackLines(materials: Iterable<LineMaterial>): void {
    for (const m of materials) this.lines.delete(m);
  }

  /** Keeps the orbit target within `radius` of `centre`; a pan past it moves target and camera back together. */
  setPanLimit(centre: Vector3, radius: number): void {
    this.panCentre.copy(centre);
    this.panLimit = radius;
  }

  requestRender(): void {
    if (this.frame !== null || this.disposed) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      if (this.disposed) return;
      this.beforeRender?.();
      this.renderer.render(this.scene, this.camera);
    });
  }

  /** What a ray through a viewport point (client pixels) hits, nearest first. */
  raycast(clientX: number, clientY: number, targets: Object3D[], recursive = false): Intersection[] {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return [];
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObjects(targets, recursive);
  }

  get ray() {
    return this.raycaster.ray;
  }

  dispose(): void {
    this.disposed = true;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.canvas.removeEventListener('contextmenu', this.preventMenu);
    this.controls.removeEventListener('change', this.onControlsChange);
    this.controls.dispose();
    this.lines.clear();
    this.renderer.dispose();
    // dispose() keeps the WebGL context alive; browsers cap live contexts, so release it now.
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }

  private readonly preventMenu = (e: Event) => e.preventDefault();

  private readonly onControlsChange = () => {
    const offset = this.excess.copy(this.controls.target).sub(this.panCentre);
    const length = offset.length();
    if (length > this.panLimit) {
      offset.multiplyScalar(1 - this.panLimit / length);
      this.controls.target.sub(offset);
      this.camera.position.sub(offset);
    }
    this.requestRender();
  };

  private resize(): void {
    const { width, height } = this.host.getBoundingClientRect();
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height, false);
    this.resolution.set(width, height);
    for (const m of this.lines) m.resolution.copy(this.resolution);
    this.camera.aspect = this.aspect ?? width / height;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }
}
