import {
  ArrowHelper, BoxGeometry, BufferGeometry, Color, EdgesGeometry, Float32BufferAttribute, Group, LineBasicMaterial, LineDashedMaterial, LineLoop,
  Box3, LineSegments, Material, Mesh, Object3D, MeshBasicMaterial, PerspectiveCamera, Raycaster, Scene, Texture, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { caseExtents, fanGeometries, RADIATOR_PICK_KEY, type CaseBox, type CaseLayout } from '../../../../lib/cooling/caseLayout';
import { fanRadii } from '../../../../lib/cooling/fanGeometry';
import type { FanDirection } from '../../../../lib/cooling/pressureModel';
import { parseCaseModel, sceneToLayoutMatrix, STRUCTURE_LINE_DIM, styleCaseModel } from '../../../../lib/scene/caseModel';
import { FlowLayer, type FlowColors, type FlowOptions } from '../../../../lib/cooling/flow/flowLayer';
import type { FlowInput } from '../../../../lib/cooling/flow/gridScene';
import { NO_TEMPS, type ComponentTemps, type HeatAnchor } from '../../../../lib/cooling/flow/heatModel';

export interface CaseSceneState {
  layout: CaseLayout;
  /** Direction of every fan slot, by slot key. */
  directions: Readonly<Record<string, FanDirection>>;
  /** Slots of the channel selected on the left. */
  highlighted: ReadonlySet<string>;
  /** Slots bound to any channel. */
  bound: ReadonlySet<string>;
  /** False hides the case, the fans and their picking, leaving only the airflow layer. */
  showCase: boolean;
  /** Slots bound to a simulated fan: their rings are drawn dashed. */
  simulated: ReadonlySet<string>;
  /** The slot whose direction control is open. */
  active: string | null;
  /** Airflow simulation input; null leaves the flow layer empty. */
  flow: FlowInput | null;
  flowOptions: FlowOptions;
  /** Build's exported case model (binary glTF); when present it replaces the outline of the layout's boxes. */
  model: ArrayBuffer | null;
}

/** Where an anchor lands on the canvas, CSS pixels; `visible` is false behind the camera or off the canvas. */
export interface ProjectedAnchor {
  x: number;
  y: number;
  visible: boolean;
}

export interface CaseSceneRenderer {
  setState: (state: CaseSceneState) => void;
  /** Live part temperatures: reach the particles' heat uniforms only, never the solver or the particles themselves. */
  setTemps: (temps: ComponentTemps) => void;
  /** Points to follow on screen; `onProject` runs after each drawn frame with their canvas positions by key. */
  setAnchors: (anchors: readonly HeatAnchor[], onProject: (positions: Record<string, ProjectedAnchor>) => void) => void;
  resize: () => void;
  dispose: () => void;
  /** False once a layer has found no float render target: the airflow layer cannot run here. */
  readonly flowSupported: boolean;
}

/** A click that lands on a fan slot or on nothing; x and y are CSS pixels inside the canvas. */
export type PickHandler = (slotKey: string | null, x: number, y: number) => void;

const CLICK_SLOP_PX = 4;
const RING_SEGMENTS = 48;
const BASE_OPACITY = 0.3;
const FAN_OPACITY = 1;
// Build's picked-part treatment: the pick reads in full and shows through, keeping its intake or exhaust color; the rest fall back to this fraction.
const DIMMED = 0.22;
const EMPTY_FAN_OPACITY = 0.28;
const VIEW_DIRECTION = new Vector3(-0.9, 0.7, -1.3).normalize();
const FIT_MARGIN = 1.35;
const AXES = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) } as const;

// The 2D canvas context normalizes any CSS color syntax (4-digit hex, rgba, named) to forms three can parse.
function token(el: Element, name: string, fallback: string): Color {
  const ctx = document.createElement('canvas').getContext('2d');
  const raw = getComputedStyle(el).getPropertyValue(name).trim();
  if (!ctx) return new Color(fallback);
  ctx.fillStyle = fallback;
  if (raw) ctx.fillStyle = raw;
  return new Color(String(ctx.fillStyle).replace(/^rgba\((.*),[^,]*\)$/, 'rgb($1)'));
}

/** Solid for a real fan, dashed for a simulated one; the dash scales with the ring so every size reads alike. */
export function ringMaterial(color: Color, opacity: number, radius: number, simulated: boolean): LineBasicMaterial | LineDashedMaterial {
  const base = { color, transparent: true, opacity, depthWrite: false };
  return simulated ? new LineDashedMaterial({ ...base, dashSize: radius * 0.2, gapSize: radius * 0.14 }) : new LineBasicMaterial(base);
}

function ringGeometry(radius: number, axis: 'x' | 'y' | 'z'): BufferGeometry {
  const pts: number[] = [];
  for (let i = 0; i < RING_SEGMENTS; i++) {
    const a = (i / RING_SEGMENTS) * Math.PI * 2;
    const c = Math.cos(a) * radius;
    const s = Math.sin(a) * radius;
    if (axis === 'x') pts.push(0, c, s); else if (axis === 'y') pts.push(c, 0, s); else pts.push(c, s, 0);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pts, 3));
  return g;
}

function ringAxisOf(box: CaseBox): 'x' | 'y' | 'z' {
  if (box.fans) return box.fans.axis;
  const [x, y, z] = box.size;
  return x <= y && x <= z ? 'x' : y <= z ? 'y' : 'z';
}

/** Frees everything a parsed model holds on the GPU: its geometry, its materials and their textures. */
function disposeParsed(root: Group): void {
  root.traverse(o => {
    const mesh = o as Mesh;
    mesh.geometry?.dispose();
    for (const material of Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []) {
      for (const value of Object.values(material)) if (value instanceof Texture) value.dispose();
      material.dispose();
    }
  });
}

/** Build exports the AIO pump and radiator both as `cooler`; the loader renames repeats to `cooler_1`. */
const COOLER_NODE = /^cooler(_\d+)?$/;

/**
 * Shows every model node named "cooler", then hides each whose center lies inside `from` (layout mm): the radiator drawn where the layout first placed it, once the user moved it.
 * `root` must already sit in layout space. Returns the hidden nodes.
 */
export function hideMovedRadiator(root: Object3D, from: Pick<CaseBox, 'min' | 'size'> | null): Object3D[] {
  root.updateMatrixWorld(true);
  const hidden: Object3D[] = [];
  const center = new Vector3();
  root.traverse(o => {
    if (!COOLER_NODE.test(o.name)) return;
    o.visible = true;
    if (!from) return;
    new Box3().setFromObject(o).getCenter(center);
    if ([0, 1, 2].every(i => center.getComponent(i) >= from.min[i] && center.getComponent(i) <= from.min[i] + from.size[i])) {
      o.visible = false;
      hidden.push(o);
    }
  });
  return hidden;
}

const modelKeyOf = (l: CaseLayout): string => `${l.size.join(',')}|${l.windowRight === true}`;

export function createCaseRenderer(canvas: HTMLCanvasElement, onPick: PickHandler): CaseSceneRenderer {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, 1, 20000);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = true;
  const staticGroup = new Group();
  const fanGroup = new Group();
  const flowGroup = new Group();
  const moveGroup = new Group();
  scene.add(staticGroup, fanGroup, flowGroup, moveGroup);
  let flowLayer: FlowLayer | null = null;
  let flowInput: FlowInput | null = null;
  let temps: ComponentTemps = NO_TEMPS;
  let anchors: readonly HeatAnchor[] = [];
  let onProject: ((positions: Record<string, ProjectedAnchor>) => void) | null = null;
  let modelBytes: ArrayBuffer | null = null;
  // The model is parsed and styled for one case size and window side; a layout object that changes neither keeps it.
  let modelKey = '';
  let modelToken = 0;
  let modelGroup: Group | null = null;
  let modelStyle: { dispose: () => void } | null = null;
  let disposed = false;
  let collisionsOn = false;
  let showCase = true;
  // The collision view stands in for both the model and the outline; Airflow hides the case and the fans.
  const applyVisibility = () => {
    staticGroup.visible = showCase && !modelGroup && !collisionsOn;
    if (modelGroup) modelGroup.visible = showCase && !collisionsOn;
    fanGroup.visible = showCase;
    moveGroup.visible = showCase && !!modelGroup && !collisionsOn;
  };

  const clearModel = () => {
    if (modelGroup) scene.remove(modelGroup);
    modelStyle?.dispose();
    modelGroup = null;
    modelStyle = null;
    applyVisibility();
  };

  // The model sits in scene space as Build baked it; the inverse of that bake puts it in the layout's own frame, where the fans and the solver are.
  const showModel = async (bytes: ArrayBuffer | null, forLayout: CaseLayout) => {
    const token = ++modelToken;
    modelBytes = bytes;
    modelKey = modelKeyOf(forLayout);
    if (!bytes) { clearModel(); requestRender(); return; }
    let parsed: Group;
    try {
      parsed = await parseCaseModel(bytes);
    } catch {
      if (token === modelToken && !disposed) clearModel();
      return;
    }
    if (token !== modelToken || disposed) {
      disposeParsed(parsed);
      return;
    }
    clearModel();
    const holder = new Group();
    holder.applyMatrix4(sceneToLayoutMatrix(forLayout.size, forLayout.windowRight === true));
    holder.add(parsed);
    modelStyle = styleCaseModel(parsed, token_('--text-dim', '#8a93a6'), token_('--text-dim', '#8a93a6'));
    modelGroup = holder;
    hideMovedRadiator(holder, (layout ?? forLayout).radiatorMove?.from ?? null);
    scene.add(holder);
    applyVisibility();
    requestRender();
  };
  const token_ = (name: string, fallback: string) => token(canvas, name, fallback);
  const disposables: { dispose: () => void }[] = [];
  const moveDisposables: { dispose: () => void }[] = [];
  const fanDisposables: { dispose: () => void }[] = [];
  const raycaster = new Raycaster();
  let hitMeshes: Mesh[] = [];
  let layout: CaseLayout | null = null;
  let frame = 0;

  // Reused every frame: the projected positions, and the vector each anchor is projected through.
  const projected: Record<string, ProjectedAnchor> = {};
  const scratch = new Vector3();
  const projectAnchors = () => {
    if (!onProject || anchors.length === 0) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    for (const a of anchors) {
      const v = scratch.set(a.at[0], a.at[1], a.at[2]).project(camera);
      const x = (v.x * 0.5 + 0.5) * w;
      const y = (-v.y * 0.5 + 0.5) * h;
      const entry = projected[a.key] ?? (projected[a.key] = { x: 0, y: 0, visible: false });
      entry.x = x;
      entry.y = y;
      entry.visible = v.z < 1 && x >= 0 && x <= w && y >= 0 && y <= h;
    }
    onProject(projected);
  };

  const render = (now: number) => {
    frame = 0;
    flowLayer?.frame(now, camera, canvas.clientHeight);
    renderer.render(scene, camera);
    projectAnchors();
    // Particles keep moving after the solver settles; the loop runs only while the tab is visible.
    if (flowLayer?.active && !document.hidden) requestRender();
  };
  const requestRender = () => {
    if (!frame) frame = requestAnimationFrame(render);
  };
  controls.addEventListener('change', requestRender);
  const onVisibility = () => { if (!document.hidden) requestRender(); };
  document.addEventListener('visibilitychange', onVisibility);

  const lineMaterial = (color: Color, opacity: number, list: { dispose: () => void }[]) => {
    const m = new LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
    list.push(m);
    return m;
  };

  const fit = (l: CaseLayout) => {
    const [ex, ey, ez] = caseExtents(l);
    const center = new Vector3(ex / 2, ey / 2, ez / 2);
    const radius = Math.hypot(ex, ey, ez) / 2;
    const dist = (radius * FIT_MARGIN) / Math.sin((camera.fov * Math.PI) / 360);
    camera.position.copy(center).addScaledVector(VIEW_DIRECTION, dist);
    controls.target.copy(center);
    controls.update();
  };

  const clear = (group: Group, list: { dispose: () => void }[]) => {
    group.clear();
    list.splice(0).forEach(d => d.dispose());
  };

  const buildStatic = (l: CaseLayout) => {
    clear(staticGroup, disposables);
    const color = token(canvas, '--text-dim', '#8a93a6');
    const [ex, ey, ez] = caseExtents(l);
    const shellGeo = new EdgesGeometry(new BoxGeometry(ex, ey, ez));
    disposables.push(shellGeo);
    const shell = new LineSegments(shellGeo, lineMaterial(color, 0.75, disposables));
    shell.position.set(ex / 2, ey / 2, ez / 2);
    staticGroup.add(shell);
    for (const box of l.boxes) {
      if (box.slot === 'fan' || box.role === 'ghost' || box.role === 'limit') continue;
      const [sx, sy, sz] = box.size;
      if (sx <= 0 && sy <= 0 && sz <= 0) continue;
      const geo = new EdgesGeometry(new BoxGeometry(Math.max(sx, 0.01), Math.max(sy, 0.01), Math.max(sz, 0.01)));
      disposables.push(geo);
      const edges = new LineSegments(geo, lineMaterial(color, box.role === 'part' ? BASE_OPACITY * 1.4 : BASE_OPACITY * 0.6, disposables));
      edges.position.set(box.min[0] + sx / 2, box.min[1] + sy / 2, box.min[2] + sz / 2);
      edges.rotation.y = box.rotationY ?? 0;
      staticGroup.add(edges);
    }
    fit(l);
  };

  // With the model showing, the box the radiator moved to is drawn as an outline in the model's own line style; the model still shows it where Build placed it.
  const buildMove = (l: CaseLayout) => {
    clear(moveGroup, moveDisposables);
    const to = l.radiatorMove?.to;
    if (!to) return;
    const [sx, sy, sz] = to.size;
    const geo = new EdgesGeometry(new BoxGeometry(Math.max(sx, 0.01), Math.max(sy, 0.01), Math.max(sz, 0.01)));
    moveDisposables.push(geo);
    const edges = new LineSegments(geo, lineMaterial(token(canvas, '--text-dim', '#8a93a6'), 0.45 * STRUCTURE_LINE_DIM, moveDisposables));
    edges.position.set(to.min[0] + sx / 2, to.min[1] + sy / 2, to.min[2] + sz / 2);
    edges.rotation.y = to.rotationY ?? 0;
    moveGroup.add(edges);
  };

  const buildFans = (state: CaseSceneState) => {
    clear(fanGroup, fanDisposables);
    hitMeshes = [];
    const l = state.layout;
    const [ex, ey, ez] = caseExtents(l);
    const caseCenter = new Vector3(ex / 2, ey / 2, ez / 2);
    const intake = token(canvas, '--airflow-cool', '#38bdf8');
    const exhaust = token(canvas, '--bad', '#ef4444');
    const picking = state.highlighted.size > 0 || state.active !== null;
    for (const { slot, box } of fanGeometries(l)) {
      const occupied = slot.taken === 'fan';
      const dir = state.directions[slot.key] ?? 'intake';
      const color = dir === 'intake' ? intake : exhaust;
      const emphasised = state.highlighted.has(slot.key) || state.active === slot.key;
      const center = new Vector3(box.min[0] + box.size[0] / 2, box.min[1] + box.size[1] / 2, box.min[2] + box.size[2] / 2);
      const given = slot.axis ? new Vector3(...slot.axis) : null;
      const localGiven = given?.clone().applyAxisAngle(AXES.y, -(box.rotationY ?? 0));
      const axis = localGiven
        ? (['x', 'y', 'z'] as const).reduce((best, k) => (Math.abs(localGiven[k]) > Math.abs(localGiven[best]) ? k : best), 'x' as 'x' | 'y' | 'z')
        : ringAxisOf(box);
      const diameter = box.fans?.diameter ?? Math.max(...box.size);
      const group = new Group();
      group.position.copy(center);
      group.rotation.y = box.rotationY ?? 0;
      const opacity = occupied ? FAN_OPACITY : EMPTY_FAN_OPACITY;
      const axisIndex = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
      const frameMm = Math.min(...box.size.filter((_, i) => i !== axisIndex));
      const radii = fanRadii(frameMm);
      // Tip ring and hub ring: the air moves through the open ring between them.
      for (const r of [radii.tip, radii.hub]) {
        const geo = ringGeometry(r, axis);
        fanDisposables.push(geo);
        const mat = ringMaterial(color, emphasised ? 1 : opacity * (picking ? DIMMED : 1), r, state.simulated.has(slot.key));
        mat.depthTest = !emphasised;
        fanDisposables.push(mat);
        const ring = new LineLoop(geo, mat);
        if (mat instanceof LineDashedMaterial) ring.computeLineDistances();
        group.add(ring);
      }
      fanGroup.add(group);

      const world = AXES[axis].clone().applyAxisAngle(AXES.y, box.rotationY ?? 0);
      const inward = given ?? world.clone().multiplyScalar(caseCenter.clone().sub(center).dot(world) >= 0 ? 1 : -1);
      const flow = inward.clone().multiplyScalar(dir === 'intake' ? 1 : -1);
      const length = diameter * 0.9;
      const arrow = new ArrowHelper(flow, center.clone().addScaledVector(flow, -length / 2), length, color.getHex(), length * 0.3, length * 0.18);
      for (const m of [arrow.line.material, arrow.cone.material] as Material[]) {
        m.transparent = true;
        m.opacity = occupied ? 0.95 : 0.35;
        m.depthWrite = false;
        fanDisposables.push(m);
      }
      fanDisposables.push(arrow.line.geometry, arrow.cone.geometry);
      fanGroup.add(arrow);

      if (state.bound.has(slot.key) && !emphasised) {
        const mark = new Mesh(new BoxGeometry(...box.size), new MeshBasicMaterial({ color, transparent: true, opacity: 0.12, depthWrite: false }));
        mark.position.copy(center);
        mark.rotation.y = box.rotationY ?? 0;
        fanDisposables.push(mark.geometry, mark.material);
        fanGroup.add(mark);
      }

      const hit = new Mesh(
        new BoxGeometry(...box.size),
        new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
      );
      hit.position.copy(center);
      hit.rotation.y = box.rotationY ?? 0;
      hit.userData.slotKey = slot.key;
      fanDisposables.push(hit.geometry, hit.material);
      fanGroup.add(hit);
      hitMeshes.push(hit);
    }
    // The radiator box itself is pickable, so a radiator with no fans can still be moved.
    const radiatorBox = l.radiatorOptions?.find(o => o.mount === l.radiatorMount)?.box;
    if (radiatorBox) {
      const hit = new Mesh(new BoxGeometry(...radiatorBox.size), new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      hit.position.set(radiatorBox.min[0] + radiatorBox.size[0] / 2, radiatorBox.min[1] + radiatorBox.size[1] / 2, radiatorBox.min[2] + radiatorBox.size[2] / 2);
      hit.rotation.y = radiatorBox.rotationY ?? 0;
      hit.userData.slotKey = RADIATOR_PICK_KEY;
      fanDisposables.push(hit.geometry, hit.material);
      fanGroup.add(hit);
      hitMeshes.push(hit);
    }
  };

  let down: { x: number; y: number } | null = null;
  const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
  const onUp = (e: PointerEvent) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_SLOP_PX) { down = null; return; }
    down = null;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    raycaster.setFromCamera(new Vector2((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1), camera);
    // A fan wins over the radiator box it sits against.
    const hits = showCase ? raycaster.intersectObjects(hitMeshes, false) : [];
    const hit = hits.find(h => h.object.userData.slotKey !== RADIATOR_PICK_KEY) ?? hits[0];
    onPick(typeof hit?.object.userData.slotKey === 'string' ? hit.object.userData.slotKey : null, x, y);
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    requestRender();
  };

  return {
    setState(state) {
      if (state.layout !== layout) {
        const previous = layout;
        layout = state.layout;
        buildStatic(state.layout);
        buildMove(state.layout);
        if (modelGroup) hideMovedRadiator(modelGroup, state.layout.radiatorMove?.from ?? null);
        // The flow layer lives as long as the case shape: a fan edit changes the layout object but keeps the field and the particles.
        const extents = caseExtents(state.layout);
        if (!flowLayer || !previous || caseExtents(previous).some((v, i) => v !== extents[i])) {
          flowLayer?.dispose();
          flowInput = null;
          const [ex, ey, ez] = extents;
          const colors: FlowColors = {
            cool: token(canvas, '--airflow-cool', '#38bdf8'), warm: token(canvas, '--airflow-warm', '#f59e0b'), hot: token(canvas, '--bad', '#ef4444'),
            collision: token(canvas, '--bad', '#ef4444'), porous: token(canvas, '--airflow-cool', '#38bdf8'),
          };
          flowLayer = new FlowLayer(renderer, flowGroup, new Vector3(ex, ey, ez), colors);
          flowLayer.setTemps(temps);
        }
      }
      showCase = state.showCase;
      applyVisibility();
      buildFans(state);
      if (state.model !== modelBytes || (modelKey !== modelKeyOf(state.layout) && state.model)) void showModel(state.model, state.layout);
      flowLayer?.setOptions(state.flowOptions);
      if (collisionsOn !== state.flowOptions.collisions) { collisionsOn = state.flowOptions.collisions; applyVisibility(); }
      if (state.flow !== flowInput) {
        flowInput = state.flow;
        flowLayer?.setInput(state.flow);
      }
      requestRender();
    },
    setTemps(next) {
      temps = next;
      flowLayer?.setTemps(next);
      // New labels need a projection even when nothing else moves.
      requestRender();
    },
    setAnchors(next, cb) {
      anchors = next;
      onProject = cb;
      for (const key of Object.keys(projected)) delete projected[key];
      requestRender();
    },
    get flowSupported() {
      return flowLayer?.supported ?? true;
    },
    resize,
    dispose() {
      if (frame) cancelAnimationFrame(frame);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      document.removeEventListener('visibilitychange', onVisibility);
      flowLayer?.dispose();
      flowLayer = null;
      disposed = true;
      modelToken++;
      clearModel();
      controls.dispose();
      clear(staticGroup, disposables);
      clear(fanGroup, fanDisposables);
      clear(moveGroup, moveDisposables);
      renderer.forceContextLoss();
      renderer.dispose();
    },
  };
}
