import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { SceneAnchor, SceneBinding, SceneCamera, SceneObject, Vec3 } from '../../api/lightingScene';
import { subscribeLedFrame, type LedFrame } from '../ledFrameStore';
import { applyCamera, CAMERA_FAR, CAMERA_NEAR, projectToCanvas } from './sceneCamera';
import { CANVAS_H, CANVAS_W, rotateYaw, toWorld } from './sceneMath';

export type ScenePick =
  | { kind: 'anchor'; objectId: string; anchorId: string }
  | { kind: 'object'; objectId: string };

export interface SceneRenderState {
  objects: SceneObject[];
  bindings: SceneBinding[];
  /** World LED positions per placed device (x, y, z triples, NaN = disabled). */
  leds: Map<string, Float32Array>;
  selectedDeviceId: string | null;
  selectedObjectId: string | null;
  /** A device waiting for a surface: free surfaces glow to invite the click. */
  placing: boolean;
  /** Surface under a drag from the device list, as "objectId\nanchorId". */
  dropTarget: string | null;
  /** The selected object can be dragged across the desk. */
  editable: boolean;
}

export interface SceneRendererCallbacks {
  onCamera: (camera: SceneCamera, final: boolean) => void;
  onPick: (pick: ScenePick | null) => void;
  onMoveObject: (objectId: string, position: Vec3) => void;
  /** LED canvas positions after the camera or the placements changed. */
  onProjected?: (points: Map<string, Float32Array>) => void;
  /** What the pointer rests on, with its client position; null when it leaves everything. */
  onHover?: (pick: ScenePick | null, clientX: number, clientY: number) => void;
}

/** Visual tones, read from the theme so the editor follows the accent. */
export interface SceneTheme {
  accent: string;
  line: string;
  face: string;
  desk: string;
}

const anchorKey = (objectId: string, anchorId: string) => `${objectId}\n${anchorId}`;
const CLICK_SLOP_PX = 5;
const SNAP_MM = 5;
const DESK_THICKNESS = 25;

function dotTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(255,255,255,1)');
  g.addColorStop(0.75, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

/** World basis of an anchor surface: x along the map's u, y toward its top, z out of the surface. */
function anchorMatrix(obj: SceneObject, a: SceneAnchor): Matrix4 {
  const right = new Vector3(...rotateYaw(a.right, obj.yaw)).normalize();
  const up = new Vector3(...rotateYaw(a.up, obj.yaw)).normalize();
  const normal = new Vector3().crossVectors(right, up).normalize();
  // Re-orthogonalise so a slightly skewed export still draws a flat surface.
  up.crossVectors(normal, right).normalize();
  const m = new Matrix4().makeBasis(right, up, normal);
  m.setPosition(new Vector3(...toWorld(obj, a.center)));
  return m;
}

function outline(a: SceneAnchor): BufferGeometry {
  const pts: number[] = [];
  if (a.shape === 'ring') {
    const r = Math.min(a.width, a.height) * 0.46;
    for (let i = 0; i < 64; i++) {
      const t = (i / 64) * Math.PI * 2;
      pts.push(Math.cos(t) * r, Math.sin(t) * r, 0.5);
    }
  } else {
    const w = a.width / 2, h = a.height / 2;
    pts.push(-w, -h, 0.5, w, -h, 0.5, w, h, 0.5, -w, h, 0.5);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pts, 3));
  return g;
}

export class SceneRenderer {
  readonly camera: PerspectiveCamera;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly controls: OrbitControls;
  private readonly world = new Group();
  private readonly objectsGroup = new Group();
  private readonly anchorsGroup = new Group();
  private model: Group | null = null;
  private dots: Points | null = null;
  private readonly dotMap = dotTexture();
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly scratch = new Vector3();
  private state: SceneRenderState | null = null;
  private frame: LedFrame = { pixels: null, w: 0, h: 0, seq: 0 };
  private readonly unsubscribeFrame: () => void;
  private readonly resizeObserver: ResizeObserver;
  private interacting = false;
  private down: { x: number; y: number; pick: ScenePick | null } | null = null;
  private drag: { objectId: string; group: Object3D; plane: Plane; offset: Vector3; start: Vec3; moved: boolean } | null = null;
  private hovered: string | null = null;
  private anchorLines = new Map<string, LineLoop>();
  private objectGroups = new Map<string, Group>();
  private theme: SceneTheme;
  private disposed = false;

  private readonly canvas: HTMLCanvasElement;
  private readonly callbacks: SceneRendererCallbacks;

  constructor(canvas: HTMLCanvasElement, callbacks: SceneRendererCallbacks, theme: SceneTheme) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.theme = theme;
    this.renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.camera = new PerspectiveCamera(40, CANVAS_W / CANVAS_H, CAMERA_NEAR, CAMERA_FAR);
    this.camera.position.set(0, 600, 1800);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = false;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 150;
    this.controls.maxDistance = 20_000;
    this.controls.addEventListener('start', () => { this.interacting = true; });
    this.controls.addEventListener('change', () => {
      if (this.interacting) {
        this.callbacks.onCamera(this.getCamera(), false);
        this.publishProjection();
      }
    });
    this.controls.addEventListener('end', () => {
      this.interacting = false;
      this.callbacks.onCamera(this.getCamera(), true);
      this.publishProjection();
    });
    this.world.add(this.objectsGroup, this.anchorsGroup);
    this.scene.add(this.world);

    canvas.addEventListener('pointerdown', this.onPointerDown, { capture: true });
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    window.addEventListener('pointerup', this.onPointerUp);
    this.unsubscribeFrame = subscribeLedFrame(f => { this.frame = f; });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.renderer.setAnimationLoop(this.tick);
  }

  dispose(): void {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.unsubscribeFrame();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown, { capture: true });
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.controls.dispose();
    this.clearGroup(this.objectsGroup);
    this.clearGroup(this.anchorsGroup);
    this.dotMap.dispose();
    this.renderer.dispose();
  }

  setTheme(theme: SceneTheme): void {
    this.theme = theme;
    if (this.state) this.rebuild();
  }

  getCamera(): SceneCamera {
    const p = this.camera.position;
    const t = this.controls.target;
    const r = (v: number) => Math.round(v * 10) / 10;
    return { position: [r(p.x), r(p.y), r(p.z)], target: [r(t.x), r(t.y), r(t.z)], fov: this.camera.fov };
  }

  /** Moves the camera unless the user is dragging it. */
  setCamera(cam: SceneCamera): void {
    if (this.interacting) return;
    applyCamera(this.camera, cam);
    this.controls.target.set(...cam.target);
    this.controls.update();
    this.publishProjection();
  }

  async setModel(bytes: ArrayBuffer | null): Promise<void> {
    if (this.model) {
      this.clearGroup(this.model, true);
      this.model = null;
    }
    if (bytes) {
      const gltf = await new GLTFLoader().parseAsync(bytes, '');
      if (this.disposed) return;
      this.model = gltf.scene;
      this.styleModel(this.model);
    }
    if (this.state) this.rebuild();
  }

  setState(next: SceneRenderState): void {
    const prev = this.state;
    this.state = next;
    if (!prev || prev.objects !== next.objects || prev.bindings !== next.bindings || prev.leds !== next.leds) {
      this.rebuild();
    } else {
      this.restyle();
    }
  }

  /** What sits under a viewport point (client pixels): a surface first, then an object. */
  pickAt(clientX: number, clientY: number): ScenePick | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects([this.anchorsGroup, this.objectsGroup], true);
    const anchor = hits.find(h => h.object.userData.pick === 'anchor');
    if (anchor) return { kind: 'anchor', objectId: anchor.object.userData.objectId, anchorId: anchor.object.userData.anchorId };
    const obj = hits.find(h => h.object.userData.pick === 'object');
    return obj ? { kind: 'object', objectId: obj.object.userData.objectId } : null;
  }

  private resize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    // The aspect stays the canvas's own: the viewport is styled to it, and the hardware samples through it.
    this.camera.aspect = CANVAS_W / CANVAS_H;
    this.camera.updateProjectionMatrix();
  }

  private readonly tick = () => {
    this.paintDots();
    this.renderer.render(this.scene, this.camera);
  };

  private paintDots(): void {
    const dots = this.dots;
    const { pixels, w, h } = this.frame;
    if (!dots) return;
    const pos = dots.geometry.getAttribute('position') as BufferAttribute;
    const col = dots.geometry.getAttribute('color') as BufferAttribute;
    const n = pos.count;
    this.camera.updateMatrixWorld();
    for (let i = 0; i < n; i++) {
      if (!pixels || w === 0) {
        col.setXYZ(i, 0.85, 0.85, 0.85);
        continue;
      }
      const p = projectToCanvas(this.camera, [pos.getX(i), pos.getY(i), pos.getZ(i)], this.scratch);
      if (!p) {
        col.setXYZ(i, 0, 0, 0);
        continue;
      }
      const px = Math.min(w - 1, Math.max(0, Math.floor((p[0] / CANVAS_W) * w)));
      const py = Math.min(h - 1, Math.max(0, Math.floor((p[1] / CANVAS_H) * h)));
      const s = (py * w + px) * 3;
      // A dark LED still needs to read as a dot on the dark viewport.
      col.setXYZ(i, Math.max(pixels[s] / 255, 0.08), Math.max(pixels[s + 1] / 255, 0.08), Math.max(pixels[s + 2] / 255, 0.08));
    }
    col.needsUpdate = true;
  }

  private publishProjection(): void {
    if (!this.callbacks.onProjected || !this.state) return;
    this.camera.updateMatrixWorld();
    const out = new Map<string, Float32Array>();
    for (const [id, world] of this.state.leds) {
      const n = world.length / 3;
      const pts = new Float32Array(n * 2).fill(Number.NaN);
      for (let i = 0; i < n; i++) {
        if (Number.isNaN(world[i * 3])) continue;
        const p = projectToCanvas(this.camera, [world[i * 3], world[i * 3 + 1], world[i * 3 + 2]], this.scratch);
        if (p) {
          pts[i * 2] = p[0];
          pts[i * 2 + 1] = p[1];
        }
      }
      out.set(id, pts);
    }
    this.callbacks.onProjected(out);
  }

  private clearGroup(group: Object3D, disposeShared = false): void {
    for (const child of [...group.children]) {
      group.remove(child);
      child.traverse(o => {
        if (o.userData.shared && !disposeShared) return;
        const m = o as Mesh;
        m.geometry?.dispose?.();
        const mat = m.material;
        if (Array.isArray(mat)) mat.forEach(x => x.dispose());
        else mat?.dispose?.();
      });
    }
  }

  private styleModel(model: Group): void {
    const meshes: Mesh[] = [];
    model.traverse(o => { if ((o as Mesh).isMesh) meshes.push(o as Mesh); });
    for (const mesh of meshes) {
      mesh.material = new MeshBasicMaterial({ color: new Color(this.theme.face), transparent: true, opacity: 0.18, side: DoubleSide, depthWrite: false });
      mesh.add(new LineSegments(new EdgesGeometry(mesh.geometry, 25), new LineBasicMaterial({ color: new Color(this.theme.line), transparent: true, opacity: 0.55 })));
    }
    // Clones share these buffers; clearGroup leaves them for the model's own disposal.
    model.traverse(o => { o.userData.shared = true; });
  }

  private rebuild(): void {
    const state = this.state;
    if (!state) return;
    this.clearGroup(this.objectsGroup);
    this.clearGroup(this.anchorsGroup);
    this.anchorLines.clear();
    this.objectGroups.clear();
    if (this.dots) {
      this.scene.remove(this.dots);
      this.dots.geometry.dispose();
      (this.dots.material as PointsMaterial).dispose();
      this.dots = null;
    }

    this.objectsGroup.add(this.buildDesk(state.objects));
    for (const obj of state.objects) {
      const g = new Group();
      g.position.set(...obj.position);
      g.rotation.y = (obj.yaw * Math.PI) / 180;
      if (obj.kind === 'case' && obj.hasModel && this.model) {
        const model = this.model.clone(true);
        g.add(model);
        // The model is drawn, but picking uses the case's bounds so it can be grabbed anywhere.
        g.add(this.pickBox(obj));
      } else {
        g.add(this.objectBox(obj));
      }
      this.objectsGroup.add(g);
      this.objectGroups.set(obj.id, g);
      for (const a of obj.anchors) this.addAnchor(obj, a);
    }

    const positions: number[] = [];
    for (const world of state.leds.values()) {
      for (let i = 0; i < world.length; i += 3) {
        if (!Number.isNaN(world[i])) positions.push(world[i], world[i + 1], world[i + 2]);
      }
    }
    if (positions.length > 0) {
      const geo = new BufferGeometry();
      geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
      geo.setAttribute('color', new Float32BufferAttribute(new Float32Array(positions.length).fill(0.85), 3));
      const mat = new PointsMaterial({ size: 9, sizeAttenuation: false, vertexColors: true, map: this.dotMap, transparent: true, alphaTest: 0.05, depthTest: false });
      this.dots = new Points(geo, mat);
      this.dots.renderOrder = 10;
      this.scene.add(this.dots);
    }
    this.restyle();
    this.publishProjection();
  }

  private buildDesk(objects: SceneObject[]): Group {
    const g = new Group();
    const desk = objects.filter(o => o.kind !== 'case' || o.position[1] <= 1);
    let minX = -800, maxX = 800, minZ = -375, maxZ = 375;
    for (const o of desk) {
      const r = Math.hypot(o.size[0], o.size[2]) / 2;
      minX = Math.min(minX, o.position[0] - r - 40);
      maxX = Math.max(maxX, o.position[0] + r + 40);
      minZ = Math.min(minZ, o.position[2] - r - 40);
      maxZ = Math.max(maxZ, o.position[2] + r + 40);
    }
    const geo = new BoxGeometry(maxX - minX, DESK_THICKNESS, maxZ - minZ);
    const slab = new Mesh(geo, new MeshBasicMaterial({ color: new Color(this.theme.desk), transparent: true, opacity: 0.35, depthWrite: false }));
    slab.position.set((minX + maxX) / 2, -DESK_THICKNESS / 2, (minZ + maxZ) / 2);
    const edges = new LineSegments(new EdgesGeometry(geo), new LineBasicMaterial({ color: new Color(this.theme.line), transparent: true, opacity: 0.25 }));
    edges.position.copy(slab.position);
    g.add(slab, edges);
    return g;
  }

  private objectBox(obj: SceneObject): Group {
    const g = new Group();
    const [w, h, d] = obj.size;
    const geo = new BoxGeometry(w, h, d);
    const face = new Mesh(geo, new MeshBasicMaterial({ color: new Color(this.theme.face), transparent: true, opacity: 0.22, depthWrite: false }));
    face.position.y = h / 2;
    face.userData = { pick: 'object', objectId: obj.id, role: 'face' };
    const edges = new LineSegments(new EdgesGeometry(geo), new LineBasicMaterial({ color: new Color(this.theme.line), transparent: true, opacity: 0.6 }));
    edges.position.y = h / 2;
    edges.userData = { role: 'edges' };
    g.add(face, edges);
    return g;
  }

  private pickBox(obj: SceneObject): Mesh {
    const [w, h, d] = obj.size;
    const mesh = new Mesh(new BoxGeometry(w, h, d), new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    mesh.position.y = h / 2;
    mesh.userData = { pick: 'object', objectId: obj.id };
    return mesh;
  }

  private addAnchor(obj: SceneObject, a: SceneAnchor): void {
    const m = anchorMatrix(obj, a);
    const g = new Group();
    g.applyMatrix4(m);
    const line = new LineLoop(outline(a), new LineBasicMaterial({ color: new Color(this.theme.line), transparent: true, opacity: 0.4, depthTest: false }));
    line.renderOrder = 5;
    const pickGeo = a.shape === 'ring' ? new CircleGeometry(Math.min(a.width, a.height) * 0.5, 32) : new PlaneGeometry(Math.max(a.width, 12), Math.max(a.height, 12));
    const pick = new Mesh(pickGeo, new MeshBasicMaterial({ color: new Color(this.theme.accent), transparent: true, opacity: 0, side: DoubleSide, depthWrite: false }));
    pick.userData = { pick: 'anchor', objectId: obj.id, anchorId: a.id };
    pick.position.z = 0.6;
    g.add(line, pick);
    this.anchorsGroup.add(g);
    this.anchorLines.set(anchorKey(obj.id, a.id), line);
  }

  /** Surface and object highlight from the current state, without rebuilding geometry. */
  private restyle(): void {
    const state = this.state;
    if (!state) return;
    const accent = new Color(this.theme.accent);
    const line = new Color(this.theme.line);
    const boundTo = new Map<string, string>();
    for (const b of state.bindings) for (const t of b.targets) boundTo.set(anchorKey(t.objectId, t.anchorId), b.deviceId);
    for (const [key, loop] of this.anchorLines) {
      const mat = loop.material as LineBasicMaterial;
      const device = boundTo.get(key);
      const pick = loop.parent?.children.find(c => c.userData.pick === 'anchor') as Mesh | undefined;
      const pickMat = pick?.material as MeshBasicMaterial | undefined;
      let opacity = 0.35;
      let color = line;
      let fill = 0;
      if (device) {
        color = accent;
        opacity = device === state.selectedDeviceId ? 1 : 0.75;
        fill = device === state.selectedDeviceId ? 0.18 : 0;
      } else if (state.placing) {
        color = accent;
        opacity = 0.9;
        fill = 0.12;
      }
      if (key === state.dropTarget || key === this.hovered) {
        color = accent;
        opacity = 1;
        fill = 0.3;
      }
      mat.color.copy(color);
      mat.opacity = opacity;
      if (pickMat) pickMat.opacity = fill;
    }
    for (const [id, g] of this.objectGroups) {
      const selected = id === state.selectedObjectId;
      g.traverse(o => {
        if (o.userData.role === 'edges') {
          const mat = (o as LineSegments).material as LineBasicMaterial;
          mat.color.copy(selected ? accent : line);
          mat.opacity = selected ? 1 : 0.6;
        }
      });
    }
  }

  private eventPick(e: PointerEvent): ScenePick | null {
    return this.pickAt(e.clientX, e.clientY);
  }

  private readonly onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const pick = this.eventPick(e);
    this.down = { x: e.clientX, y: e.clientY, pick };
    const state = this.state;
    // Only the selected object drags across the desk; a drag that starts anywhere else orbits, so a
    // camera move that begins over the case never shoves it.
    if (state?.editable && pick && pick.objectId === state.selectedObjectId) {
      const group = this.objectGroups.get(pick.objectId);
      const obj = state.objects.find(o => o.id === pick.objectId);
      if (group && obj) {
        const plane = new Plane(new Vector3(0, 1, 0), -obj.position[1]);
        const hit = new Vector3();
        if (this.raycaster.ray.intersectPlane(plane, hit)) {
          this.drag = { objectId: obj.id, group, plane, offset: hit.sub(group.position), start: [...obj.position], moved: false };
          this.controls.enabled = false;
          this.canvas.setPointerCapture(e.pointerId);
        }
      }
    }
  };

  private readonly onPointerMove = (e: PointerEvent) => {
    if (this.drag) {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hit = new Vector3();
      if (this.raycaster.ray.intersectPlane(this.drag.plane, hit)) {
        const p = hit.sub(this.drag.offset);
        const snap = (v: number) => Math.round(v / SNAP_MM) * SNAP_MM;
        this.drag.group.position.set(snap(p.x), this.drag.start[1], snap(p.z));
        if (this.down && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > CLICK_SLOP_PX) this.drag.moved = true;
      }
      return;
    }
    if (e.buttons !== 0) {
      this.callbacks.onHover?.(null, e.clientX, e.clientY);
      return;
    }
    const pick = this.eventPick(e);
    this.callbacks.onHover?.(pick, e.clientX, e.clientY);
    const key = pick?.kind === 'anchor' ? anchorKey(pick.objectId, pick.anchorId) : null;
    const movable = this.state?.editable && pick && pick.objectId === this.state.selectedObjectId;
    this.canvas.style.cursor = pick ? (movable ? 'grab' : 'pointer') : '';
    if (key !== this.hovered) {
      this.hovered = key;
      this.restyle();
    }
  };

  private readonly onPointerLeave = (e: PointerEvent) => {
    if (this.hovered !== null) {
      this.hovered = null;
      this.restyle();
    }
    this.callbacks.onHover?.(null, e.clientX, e.clientY);
  };

  private readonly onPointerUp = (e: PointerEvent) => {
    const down = this.down;
    this.down = null;
    const drag = this.drag;
    this.drag = null;
    this.controls.enabled = true;
    if (drag?.moved) {
      const p = drag.group.position;
      this.callbacks.onMoveObject(drag.objectId, [p.x, p.y, p.z]);
      return;
    }
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_SLOP_PX) return;
    if (e.target !== this.canvas && !drag) return;
    this.callbacks.onPick(down.pick);
  };
}
