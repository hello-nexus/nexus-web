import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Vector3,
} from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { subscribeLedFrame, type LedFrame } from '../ledFrameStore';
import { layoutToSceneMatrix } from './layoutFrame';
import { applyCamera, CAMERA_FAR, CAMERA_NEAR, projectToCanvas } from './sceneCamera';
import { CANVAS_H, CANVAS_W, rotateYaw, sceneBounds, toWorld } from './sceneMath';
import { SceneStage } from './sceneStage';
import { TransformTool } from './transformTool';
import type { LayoutShape, SceneAnchor, SceneBinding, SceneCamera, SceneModel, SceneObject, Vec3 } from './sceneTypes';
import { buildShape, disposeGroup, floorGrid, type Palette, type ShapeSink } from './wireframe';

export type ScenePick =
  | { kind: 'anchor'; objectId: string; anchorId: string }
  | { kind: 'object'; objectId: string };

export interface SceneRenderState {
  objects: SceneObject[];
  bindings: SceneBinding[];
  /** World LED positions per placed device (x, y, z triples, NaN = disabled). */
  leds: Map<string, Float32Array>;
  selectedDeviceId: string | null;
  /** A device waiting for a spot: free spots glow to invite the click. */
  placing: boolean;
  /** The object with the move tool on it (a device's, or one clicked); null for none. */
  selectedObjectId: string | null;
}

export interface SceneRendererCallbacks {
  onCamera: (camera: SceneCamera, final: boolean) => void;
  /** A click, with where it landed (client pixels). */
  onPick: (pick: ScenePick | null, clientX: number, clientY: number) => void;
  /** An object moved or turned, once the drag ends. */
  onMoveObject: (objectId: string, position: Vec3, yaw: number) => void;
  /** A right click on a spot or an object (client pixels). */
  onContextMenu?: (pick: ScenePick, clientX: number, clientY: number) => void;
  /** LED canvas positions after the camera or the placements changed. */
  onProjected?: (points: Map<string, Float32Array>) => void;
  /** What the pointer rests on, with its client position; null when it leaves everything. */
  onHover?: (pick: ScenePick | null, clientX: number, clientY: number) => void;
}

const anchorKey = (objectId: string, anchorId: string) => `${objectId}\n${anchorId}`;
// The selected device's LED dots, in screen pixels; the rest draw at the plain dot size.
const SELECTED_DOT_PX = 14;
const CLICK_SLOP_PX = 5;
// Floor margin around the scene's footprint, as a fraction of its larger side.
const FLOOR_MARGIN = 0.6;
// How far the view may pan from the scene's centre, as a fraction of its radius.
const PAN_LIMIT = 0.6;

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

function outlinePoints(a: SceneAnchor): number[] {
  const pts: number[] = [];
  if (a.shape === 'ring') {
    const r = Math.min(a.width, a.height) * 0.46;
    for (let i = 0; i <= 64; i++) {
      const t = (i / 64) * Math.PI * 2;
      pts.push(Math.cos(t) * r, Math.sin(t) * r, 0.5);
    }
  } else {
    const w = a.width / 2, h = a.height / 2;
    pts.push(-w, -h, 0.5, w, -h, 0.5, w, h, 0.5, -w, h, 0.5, -w, -h, 0.5);
  }
  return pts;
}

/** An object without a shape of its own, as one box in layout space (x depth, y height, z width). */
function boxOf(obj: SceneObject): LayoutShape {
  const [w, h, d] = obj.size;
  return { size: [d, w, h], boxes: [{ slot: obj.kind, role: 'part', min: [0, 0, 0], size: [d, h, w], source: 'spec' }], lines: [] };
}

/** The Lighting page's scene: Build's wireframe objects, the spots devices sit on, and each LED as a live dot. */
export class SceneRenderer {
  private readonly stage: SceneStage;
  private readonly tool: TransformTool;
  private objectGroups = new Map<string, Group>();
  private readonly palette: Palette;
  private readonly accent: Color;
  private readonly world = new Group();
  private readonly objectsGroup = new Group();
  private readonly anchorsGroup = new Group();
  private readonly sink: ShapeSink = { materials: [], pickables: [], dimmables: [] };
  private dots: Points | null = null;
  // The selected device's LEDs again, drawn larger over the rest.
  private selectedDots: Points | null = null;
  private selectedDotsFor: string | null = null;
  private readonly dotMap = dotTexture();
  private readonly scratch = new Vector3();
  private readonly projected = new Vector3();
  private model: SceneModel | null = null;
  private state: SceneRenderState | null = null;
  private frame: LedFrame = { pixels: null, w: 0, h: 0, seq: 0 };
  private readonly unsubscribeFrame: () => void;
  private interacting = false;
  private down: { x: number; y: number; pick: ScenePick | null } | null = null;
  private hovered: string | null = null;
  private anchorLines = new Map<string, { line: LineMaterial; fill: MeshBasicMaterial }>();
  private readonly callbacks: SceneRendererCallbacks;

  /** Throws when the browser gives no WebGL context. */
  constructor(host: HTMLElement, callbacks: SceneRendererCallbacks, palette: Palette) {
    this.callbacks = callbacks;
    this.accent = palette.part.clone();
    // Parts draw in the frame tone here, so the accent is left to the spots and selections.
    this.palette = { ...palette, part: palette.frame.clone().lerp(new Color(1, 1, 1), 0.35) };
    this.stage = new SceneStage(host, { fov: 40, near: CAMERA_NEAR, far: CAMERA_FAR, aspect: CANVAS_W / CANVAS_H });
    const { controls, canvas } = this.stage;
    controls.minDistance = 150;
    controls.maxDistance = 20_000;
    controls.addEventListener('start', this.onControlsStart);
    controls.addEventListener('change', this.onControlsChange);
    controls.addEventListener('end', this.onControlsEnd);
    this.world.add(this.objectsGroup, this.anchorsGroup);
    this.stage.scene.add(this.world);
    this.stage.beforeRender = () => this.paintDots();
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerCancel);
    // After the view's own listeners, so its hover runs last and its capture-phase press runs first.
    this.tool = new TransformTool(this.stage, this.accent, {
      onSelect: () => {},
      onChange: (id, position, yaw, final) => {
        // LED dots sit in world space; they hide while their object is on the move and return where it lands.
        for (const d of [this.dots, this.selectedDots]) if (d) d.visible = final;
        if (final) this.callbacks.onMoveObject(id, position, yaw);
      },
      // A press the tool took without dragging is still a click: on a spot when it landed on one.
      onClick: (id, e) => this.callbacks.onPick(this.pickAt(e.clientX, e.clientY) ?? { kind: 'object', objectId: id }, e.clientX, e.clientY),
      onContextMenu: (id, e) => this.callbacks.onContextMenu?.(this.pickAt(e.clientX, e.clientY) ?? { kind: 'object', objectId: id }, e.clientX, e.clientY),
      pickFallback: (x, y) => this.pickAt(x, y)?.objectId ?? null,
    });
    this.unsubscribeFrame = subscribeLedFrame(f => {
      this.frame = f;
      if (this.dots) this.stage.requestRender();
    });
  }

  dispose(): void {
    // A view torn down mid-drag still saves where the camera ended up.
    if (this.interacting) this.callbacks.onCamera(this.getCamera(), true);
    this.unsubscribeFrame();
    const { controls, canvas } = this.stage;
    controls.removeEventListener('start', this.onControlsStart);
    controls.removeEventListener('change', this.onControlsChange);
    controls.removeEventListener('end', this.onControlsEnd);
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerleave', this.onPointerLeave);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerCancel);
    this.clear();
    this.dotMap.dispose();
    this.tool.dispose();
    this.stage.dispose();
  }

  getCamera(): SceneCamera {
    const p = this.stage.camera.position;
    const t = this.stage.controls.target;
    const r = (v: number) => Math.round(v * 10) / 10;
    return { position: [r(p.x), r(p.y), r(p.z)], target: [r(t.x), r(t.y), r(t.z)], fov: this.stage.camera.fov };
  }

  /** Moves the camera unless the user is dragging it. */
  setCamera(cam: SceneCamera): void {
    if (this.interacting) return;
    applyCamera(this.stage.camera, cam);
    this.stage.controls.target.set(...cam.target);
    this.stage.controls.update();
    this.stage.requestRender();
    this.publishProjection();
  }

  setModel(model: SceneModel | null): void {
    if (model === this.model) return;
    this.model = model;
    if (this.state) this.rebuild();
  }

  setState(next: SceneRenderState): void {
    const prev = this.state;
    this.state = next;
    if (!prev || prev.objects !== next.objects || prev.bindings !== next.bindings || prev.leds !== next.leds) this.rebuild();
    else this.restyle();
  }

  /** What sits under a viewport point (client pixels): a spot first, then an object. */
  pickAt(clientX: number, clientY: number): ScenePick | null {
    const hits = this.stage.raycast(clientX, clientY, [this.anchorsGroup, this.objectsGroup], true);
    const anchor = hits.find(h => h.object.userData.pick === 'anchor');
    if (anchor) return { kind: 'anchor', objectId: anchor.object.userData.objectId, anchorId: anchor.object.userData.anchorId };
    const obj = hits.find(h => h.object.userData.pick === 'object');
    return obj ? { kind: 'object', objectId: obj.object.userData.objectId } : null;
  }

  private paintDots(): void {
    for (const dots of [this.dots, this.selectedDots]) if (dots) this.paint(dots);
  }

  private paint(dots: Points): void {
    const { pixels, w, h } = this.frame;
    const camera = this.stage.camera;
    const pos = dots.geometry.getAttribute('position') as BufferAttribute;
    const col = dots.geometry.getAttribute('color') as BufferAttribute;
    const v = this.projected;
    camera.updateMatrixWorld();
    for (let i = 0; i < pos.count; i++) {
      if (!pixels || w === 0) {
        col.setXYZ(i, 0.85, 0.85, 0.85);
        continue;
      }
      v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(camera.matrixWorldInverse);
      if (-v.z < CAMERA_NEAR) {
        col.setXYZ(i, 0, 0, 0);
        continue;
      }
      v.applyMatrix4(camera.projectionMatrix);
      // Floor, as the engine truncates its sample position, so the dot shows the LED's own pixel.
      const px = Math.min(w - 1, Math.max(0, Math.floor(((v.x + 1) / 2) * w)));
      const py = Math.min(h - 1, Math.max(0, Math.floor(((1 - v.y) / 2) * h)));
      const s = (py * w + px) * 3;
      // A dark LED still needs to read as a dot on the dark viewport.
      col.setXYZ(i, Math.max(pixels[s] / 255, 0.08), Math.max(pixels[s + 1] / 255, 0.08), Math.max(pixels[s + 2] / 255, 0.08));
    }
    col.needsUpdate = true;
  }

  private publishProjection(): void {
    if (!this.callbacks.onProjected || !this.state) return;
    const camera = this.stage.camera;
    camera.updateMatrixWorld();
    const out = new Map<string, Float32Array>();
    for (const [id, world] of this.state.leds) {
      const n = world.length / 3;
      const pts = new Float32Array(n * 2).fill(Number.NaN);
      for (let i = 0; i < n; i++) {
        if (Number.isNaN(world[i * 3])) continue;
        const p = projectToCanvas(camera, [world[i * 3], world[i * 3 + 1], world[i * 3 + 2]], this.scratch);
        if (p) {
          pts[i * 2] = p[0];
          pts[i * 2 + 1] = p[1];
        }
      }
      out.set(id, pts);
    }
    this.callbacks.onProjected(out);
  }

  private clear(): void {
    for (const group of [this.objectsGroup, this.anchorsGroup]) {
      for (const child of [...group.children]) {
        group.remove(child);
        disposeGroup(child);
      }
    }
    this.stage.untrackLines(this.sink.materials);
    this.sink.materials.length = 0;
    this.sink.pickables.length = 0;
    this.sink.dimmables.length = 0;
    this.anchorLines.clear();
    this.objectGroups.clear();
    if (this.dots) {
      this.stage.scene.remove(this.dots);
      disposeGroup(this.dots);
      this.dots = null;
    }
    this.clearSelectedDots();
  }

  private rebuild(): void {
    const state = this.state;
    if (!state) return;
    this.clear();
    const bounds = sceneBounds(state.objects);
    if (bounds) {
      const side = Math.max(bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2]) * (1 + FLOOR_MARGIN);
      const grid = floorGrid(side, this.palette);
      grid.position.x = (bounds.min[0] + bounds.max[0]) / 2;
      grid.position.z = (bounds.min[2] + bounds.max[2]) / 2;
      this.objectsGroup.add(grid);
      const centre = new Vector3((bounds.min[0] + bounds.max[0]) / 2, (bounds.min[1] + bounds.max[1]) / 2, (bounds.min[2] + bounds.max[2]) / 2);
      const radius = Math.hypot(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]) / 2;
      this.stage.setPanLimit(centre, radius * PAN_LIMIT);
    }
    for (const obj of state.objects) {
      const g = new Group();
      g.position.set(...obj.position);
      g.rotation.y = (obj.yaw * Math.PI) / 180;
      const shape = (obj.hasModel ? this.model?.shapes[obj.id] : undefined) ?? boxOf(obj);
      const drawn = buildShape(shape, this.palette, this.sink, false);
      drawn.applyMatrix4(new Matrix4().set(...(layoutToSceneMatrix(shape) as Parameters<Matrix4['set']>)));
      g.add(drawn, this.pickBox(obj));
      this.objectsGroup.add(g);
      this.objectGroups.set(obj.id, g);
      for (const a of obj.anchors) this.addAnchor(obj, a);
    }
    this.stage.trackLines(this.sink.materials);
    this.tool.setTargets(state.objects.flatMap(o => {
      const g = this.objectGroups.get(o.id);
      return g ? [{ id: o.id, object: g, radius: Math.hypot(o.size[0], o.size[2]) / 2 }] : [];
    }));

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
      this.stage.scene.add(this.dots);
    }
    this.restyle();
    this.publishProjection();
  }

  private clearSelectedDots(): void {
    if (this.selectedDots) {
      this.stage.scene.remove(this.selectedDots);
      disposeGroup(this.selectedDots);
    }
    this.selectedDots = null;
    this.selectedDotsFor = null;
  }

  private placeSelectedDots(deviceId: string | null): void {
    if (deviceId === this.selectedDotsFor && (this.selectedDots || !deviceId)) return;
    this.clearSelectedDots();
    const world = deviceId ? this.state?.leds.get(deviceId) : undefined;
    if (!deviceId || !world) return;
    const positions: number[] = [];
    for (let i = 0; i < world.length; i += 3) if (!Number.isNaN(world[i])) positions.push(world[i], world[i + 1], world[i + 2]);
    if (positions.length === 0) return;
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new Float32BufferAttribute(new Float32Array(positions.length).fill(0.85), 3));
    const mat = new PointsMaterial({ size: SELECTED_DOT_PX, sizeAttenuation: false, vertexColors: true, map: this.dotMap, transparent: true, alphaTest: 0.05, depthTest: false });
    this.selectedDots = new Points(geo, mat);
    this.selectedDots.renderOrder = 11;
    this.selectedDotsFor = deviceId;
    this.stage.scene.add(this.selectedDots);
  }

  // The case is picked by its bounds, so it can be clicked anywhere, not only on its lines.
  private pickBox(obj: SceneObject): Mesh {
    const [w, h, d] = obj.size;
    const mesh = new Mesh(new BoxGeometry(w, h, d), new MeshBasicMaterial({ visible: false }));
    mesh.position.y = h / 2;
    mesh.userData = { pick: 'object', objectId: obj.id };
    return mesh;
  }

  private addAnchor(obj: SceneObject, a: SceneAnchor): void {
    const g = new Group();
    g.applyMatrix4(anchorMatrix(obj, a));
    const lineMat = new LineMaterial({ color: this.palette.frame, linewidth: 1.4, transparent: true, opacity: 0.4, depthTest: false });
    this.sink.materials.push(lineMat);
    const line = new Line2(new LineGeometry().setPositions(outlinePoints(a)), lineMat);
    line.renderOrder = 5;
    const pickGeo = a.shape === 'ring' ? new CircleGeometry(Math.min(a.width, a.height) * 0.5, 32) : new PlaneGeometry(Math.max(a.width, 12), Math.max(a.height, 12));
    const fill = new MeshBasicMaterial({ color: this.accent, transparent: true, opacity: 0, side: DoubleSide, depthWrite: false });
    const pick = new Mesh(pickGeo, fill);
    pick.userData = { pick: 'anchor', objectId: obj.id, anchorId: a.id };
    pick.position.z = 0.6;
    g.add(line, pick);
    this.anchorsGroup.add(g);
    this.anchorLines.set(anchorKey(obj.id, a.id), { line: lineMat, fill });
  }

  /** Spot highlights and the selection from the current state, without rebuilding geometry. */
  private restyle(): void {
    const state = this.state;
    if (!state) return;
    this.tool.setSelected(state.selectedObjectId);
    this.placeSelectedDots(state.selectedDeviceId);
    const boundTo = new Map<string, string>();
    for (const b of state.bindings) for (const t of b.targets) boundTo.set(anchorKey(t.objectId, t.anchorId), b.deviceId);
    const anySelected = state.selectedDeviceId != null && state.bindings.some(b => b.deviceId === state.selectedDeviceId);
    for (const [key, { line, fill }] of this.anchorLines) {
      const device = boundTo.get(key);
      let color = this.palette.frame;
      let opacity = 0.35;
      let tint = 0;
      if (device) {
        // The selected device's spots fill in; while one is selected the rest step back.
        const selected = device === state.selectedDeviceId;
        color = this.accent;
        opacity = selected ? 1 : anySelected ? 0.35 : 0.7;
        tint = selected ? 0.32 : 0;
      } else if (state.placing) {
        color = this.accent;
        opacity = 0.9;
        tint = 0.12;
      }
      if (key === this.hovered) {
        color = this.accent;
        opacity = 1;
        tint = 0.3;
      }
      line.color.copy(color);
      line.opacity = opacity;
      fill.opacity = tint;
    }
    this.stage.requestRender();
  }

  private readonly onControlsStart = () => { this.interacting = true; };

  private readonly onControlsChange = () => {
    if (!this.interacting) return;
    this.callbacks.onCamera(this.getCamera(), false);
    this.publishProjection();
  };

  private readonly onControlsEnd = () => {
    this.interacting = false;
    this.callbacks.onCamera(this.getCamera(), true);
    this.publishProjection();
  };

  private readonly onPointerDown = (e: PointerEvent) => {
    this.down = e.button === 0 ? { x: e.clientX, y: e.clientY, pick: this.pickAt(e.clientX, e.clientY) } : null;
  };

  private readonly onPointerMove = (e: PointerEvent) => {
    if (e.buttons !== 0) {
      this.callbacks.onHover?.(null, e.clientX, e.clientY);
      return;
    }
    const pick = this.pickAt(e.clientX, e.clientY);
    this.callbacks.onHover?.(pick, e.clientX, e.clientY);
    const key = pick?.kind === 'anchor' ? anchorKey(pick.objectId, pick.anchorId) : null;
    this.stage.canvas.style.cursor = key ? 'pointer' : '';
    if (key !== this.hovered) {
      this.hovered = key;
      this.restyle();
    }
  };

  private readonly onPointerCancel = () => {
    this.down = null;
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
    if (!down || e.target !== this.stage.canvas) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_SLOP_PX) return;
    this.callbacks.onPick(down.pick, e.clientX, e.clientY);
  };
}

