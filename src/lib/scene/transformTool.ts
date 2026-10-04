import { type Color, Group, Mesh, MeshBasicMaterial, type Object3D, Plane, TorusGeometry, Vector3, CircleGeometry, DoubleSide } from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import type { SceneStage } from './sceneStage';
import type { Vec3 } from './sceneTypes';

/** An object the tool can select, move across the floor and turn about its vertical axis. */
export interface Transformable {
  id: string;
  /** Positioned at the object's floor point, turned by rotation.y. */
  object: Object3D;
  /** Footprint radius on the floor, which sizes the turn ring. */
  radius: number;
}

export interface TransformCallbacks {
  onSelect: (id: string | null) => void;
  /** Degrees counter-clockwise seen from above; final once the drag ends. */
  onChange: (id: string, position: Vec3, yaw: number, final: boolean) => void;
}

const SNAP_MM = 5;
const TURN_STEP_DEG = 15;
const CLICK_SLOP_PX = 5;
// Gap between an object's footprint and its turn ring, and how far either side of the ring a press still grabs it.
const RING_GAP_MM = 40;
const RING_GRAB_MM = 18;
const RING_SEGMENTS = 96;

type Drag = { mode: 'move' | 'turn'; id: string; x: number; y: number; offset: Vector3; startYaw: number; startAngle: number; moved: boolean };

/**
 * Click to select, drag the selection to move it, drag its ring to turn it. The same tool runs in the Build portal's
 * PC view and the Lighting page's scene, so both edit the desk the same way; a drag on an object never moves the
 * camera, a drag anywhere else does.
 */
export class TransformTool {
  private readonly stage: SceneStage;
  private readonly callbacks: TransformCallbacks;
  private readonly targets = new Map<string, Transformable>();
  private selected: string | null = null;
  private enabled = true;
  private readonly ring = new Group();
  private readonly ringMaterial: LineMaterial;
  private readonly fillMaterial: MeshBasicMaterial;
  private ringLine: Line2 | null = null;
  private ringGrab: Mesh | null = null;
  private knob: Mesh | null = null;
  private drag: Drag | null = null;
  private down: { x: number; y: number } | null = null;
  private readonly floor = new Plane(new Vector3(0, 1, 0), 0);
  private readonly hit = new Vector3();

  constructor(stage: SceneStage, accent: Color, callbacks: TransformCallbacks) {
    this.stage = stage;
    this.callbacks = callbacks;
    this.ringMaterial = new LineMaterial({ color: accent, linewidth: 2, transparent: true, opacity: 0.9, depthTest: false });
    this.fillMaterial = new MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.9, depthTest: false, side: DoubleSide });
    stage.trackLines([this.ringMaterial]);
    this.ring.visible = false;
    this.ring.renderOrder = 20;
    stage.scene.add(this.ring);
    const { canvas } = stage;
    // Capture phase: a press that grabs an object must reach no one else, the orbit controls included.
    canvas.addEventListener('pointerdown', this.onDown, { capture: true });
    canvas.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onCancel);
  }

  dispose(): void {
    const { canvas } = this.stage;
    canvas.removeEventListener('pointerdown', this.onDown, { capture: true });
    canvas.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onCancel);
    this.clearRing();
    this.stage.scene.remove(this.ring);
    this.stage.untrackLines([this.ringMaterial]);
    this.ringMaterial.dispose();
    this.fillMaterial.dispose();
  }

  /** Off, it neither selects nor drags; clicks and drags all go to the view. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.select(null, false);
  }

  /** The objects as drawn now; called after every rebuild. A selection that is still there stays. */
  setTargets(list: Transformable[]): void {
    this.targets.clear();
    for (const t of list) this.targets.set(t.id, t);
    if (this.selected && !this.targets.has(this.selected)) this.select(null, true);
    else this.placeRing();
  }

  /** Selects from outside (a part picked in a list); null clears. */
  setSelected(id: string | null): void {
    if (id === this.selected || (id && !this.targets.has(id))) return;
    this.select(id, false);
  }

  get isDragging(): boolean {
    return this.drag !== null;
  }

  private select(id: string | null, notify: boolean): void {
    this.selected = id;
    this.placeRing();
    if (notify) this.callbacks.onSelect(id);
  }

  private clearRing(): void {
    for (const child of [...this.ring.children]) {
      this.ring.remove(child);
      (child as Mesh).geometry?.dispose();
    }
    this.ringLine = null;
    this.ringGrab = null;
    this.knob = null;
  }

  // The ring lies on the floor around the selection, with a knob showing which way it faces.
  private placeRing(): void {
    const t = this.selected ? this.targets.get(this.selected) : undefined;
    if (!t || !this.enabled) {
      this.ring.visible = false;
      this.stage.requestRender();
      return;
    }
    const r = t.radius + RING_GAP_MM;
    if (!this.ringLine || this.ring.userData.radius !== r) {
      this.clearRing();
      const pts: number[] = [];
      for (let i = 0; i <= RING_SEGMENTS; i++) {
        const a = (i / RING_SEGMENTS) * Math.PI * 2;
        pts.push(Math.cos(a) * r, 0, Math.sin(a) * r);
      }
      this.ringLine = new Line2(new LineGeometry().setPositions(pts), this.ringMaterial);
      this.ringLine.renderOrder = 20;
      this.ringGrab = new Mesh(new TorusGeometry(r, RING_GRAB_MM, 6, RING_SEGMENTS), new MeshBasicMaterial({ visible: false }));
      this.ringGrab.rotation.x = Math.PI / 2;
      this.knob = new Mesh(new CircleGeometry(RING_GRAB_MM * 0.7, 20), this.fillMaterial);
      this.knob.rotation.x = -Math.PI / 2;
      this.knob.renderOrder = 21;
      this.ring.add(this.ringLine, this.ringGrab, this.knob);
      this.ring.userData.radius = r;
    }
    const p = t.object.position;
    this.ring.position.set(p.x, p.y + 1, p.z);
    const yaw = t.object.rotation.y;
    // The knob sits ahead of the object (its local +Z, toward the user before any turn).
    this.knob!.position.set(Math.sin(yaw) * r, 0, Math.cos(yaw) * r);
    this.ring.visible = true;
    this.stage.requestRender();
  }

  private targetAt(clientX: number, clientY: number): string | null {
    const objects = [...this.targets.values()].map(t => t.object);
    const hits = this.stage.raycast(clientX, clientY, objects, true);
    for (const h of hits) {
      for (let o: Object3D | null = h.object; o; o = o.parent) {
        const id = [...this.targets.values()].find(t => t.object === o)?.id;
        if (id) return id;
      }
    }
    return null;
  }

  private floorPoint(clientX: number, clientY: number, y: number): Vector3 | null {
    this.stage.raycast(clientX, clientY, []);
    this.floor.constant = -y;
    return this.stage.ray.intersectPlane(this.floor, this.hit);
  }

  private readonly onDown = (e: PointerEvent) => {
    this.down = null;
    if (!this.enabled || e.button !== 0) return;
    const sel = this.selected ? this.targets.get(this.selected) : undefined;
    let mode: Drag['mode'] | null = null;
    if (sel && this.ringGrab && this.stage.raycast(e.clientX, e.clientY, [this.ringGrab]).length > 0) mode = 'turn';
    else if (sel && this.targetAt(e.clientX, e.clientY) === sel.id) mode = 'move';
    if (!sel || !mode) {
      this.down = { x: e.clientX, y: e.clientY };
      return;
    }
    const at = this.floorPoint(e.clientX, e.clientY, sel.object.position.y);
    if (!at) return;
    e.stopImmediatePropagation();
    this.stage.controls.enabled = false;
    this.stage.canvas.setPointerCapture(e.pointerId);
    const p = sel.object.position;
    this.drag = {
      mode, id: sel.id, x: e.clientX, y: e.clientY, moved: false,
      offset: at.clone().sub(p),
      startYaw: sel.object.rotation.y,
      startAngle: Math.atan2(at.x - p.x, at.z - p.z),
    };
  };

  private readonly onMove = (e: PointerEvent) => {
    const drag = this.drag;
    if (!drag) {
      if (this.enabled && e.buttons === 0) this.hover(e);
      return;
    }
    const t = this.targets.get(drag.id);
    if (!t) return;
    const at = this.floorPoint(e.clientX, e.clientY, t.object.position.y);
    if (!at) return;
    drag.moved ||= Math.hypot(e.clientX - drag.x, e.clientY - drag.y) >= CLICK_SLOP_PX;
    if (!drag.moved) return;
    const p = t.object.position;
    if (drag.mode === 'move') {
      const next = at.sub(drag.offset);
      p.set(Math.round(next.x / SNAP_MM) * SNAP_MM, p.y, Math.round(next.z / SNAP_MM) * SNAP_MM);
    } else {
      const delta = Math.atan2(at.x - p.x, at.z - p.z) - drag.startAngle;
      // Steps keep a turn square to the desk; Shift turns freely.
      const deg = ((drag.startYaw + delta) * 180) / Math.PI;
      const snapped = e.shiftKey ? Math.round(deg) : Math.round(deg / TURN_STEP_DEG) * TURN_STEP_DEG;
      t.object.rotation.y = (snapped * Math.PI) / 180;
    }
    this.placeRing();
    this.callbacks.onChange(drag.id, this.positionOf(t), this.yawOf(t), false);
  };

  private readonly onUp = (e: PointerEvent) => {
    const drag = this.drag;
    this.drag = null;
    if (drag) {
      this.stage.controls.enabled = true;
      const t = this.targets.get(drag.id);
      if (t && drag.moved) this.callbacks.onChange(drag.id, this.positionOf(t), this.yawOf(t), true);
      return;
    }
    const down = this.down;
    this.down = null;
    if (!down || !this.enabled || e.target !== this.stage.canvas) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) >= CLICK_SLOP_PX) return;
    const id = this.targetAt(e.clientX, e.clientY);
    if (id !== this.selected) this.select(id, true);
  };

  private readonly onCancel = () => {
    const drag = this.drag;
    this.drag = null;
    this.down = null;
    this.stage.controls.enabled = true;
    if (drag) {
      const t = this.targets.get(drag.id);
      if (t) this.callbacks.onChange(drag.id, this.positionOf(t), this.yawOf(t), true);
    }
  };

  // Runs after the view's own hover, so it only claims the cursor over something it can drag.
  private hover(e: PointerEvent): void {
    const sel = this.selected;
    let cursor = '';
    if (sel && this.ringGrab && this.stage.raycast(e.clientX, e.clientY, [this.ringGrab]).length > 0) cursor = 'ew-resize';
    else {
      const id = this.targetAt(e.clientX, e.clientY);
      if (id) cursor = id === sel ? 'move' : 'pointer';
    }
    if (cursor) this.stage.canvas.style.cursor = cursor;
  }

  private positionOf(t: Transformable): Vec3 {
    const p = t.object.position;
    return [p.x, p.y, p.z];
  }

  private yawOf(t: Transformable): number {
    const deg = (t.object.rotation.y * 180) / Math.PI;
    return Math.round((((deg % 360) + 360) % 360) * 10) / 10;
  }
}
