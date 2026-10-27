import {
  ArrowHelper, BoxGeometry, BufferGeometry, Color, Float32BufferAttribute, Group, LineBasicMaterial, LineDashedMaterial, LineLoop,
  Material, Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, Scene, Vector2, Vector3, WebGLRenderer,
} from 'three';
import type { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { caseExtents, fanGeometries, RADIATOR_PICK_KEY, sceneLayout, type CaseBox, type CaseLayout } from '../../../../lib/cooling/caseLayout';
import { fanRadii } from '../../../../lib/cooling/fanGeometry';
import type { FanDirection } from '../../../../lib/cooling/pressureModel';
import { buildCase, disposeGroup, scenePalette, type Palette } from '../../../../lib/scene/pcScene';
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
/** A still camera for this long, and a settled flow, lets the view draw at half rate. */
const IDLE_MS = 400;
const CALM_FRAME_MS = 1000 / 30;
const FRAME_SLACK_MS = 3;
const RING_SEGMENTS = 48;
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
  scene.add(staticGroup, fanGroup, flowGroup);
  let flowLayer: FlowLayer | null = null;
  let flowInput: FlowInput | null = null;
  let temps: ComponentTemps = NO_TEMPS;
  let anchors: readonly HeatAnchor[] = [];
  let onProject: ((positions: Record<string, ProjectedAnchor>) => void) | null = null;
  let collisionsOn = false;
  let showCase = true;
  // The collision view stands in for the case; Airflow hides the case and the fans.
  const applyVisibility = () => {
    staticGroup.visible = showCase && !collisionsOn;
    fanGroup.visible = showCase;
  };

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

  // Once the air has settled and the camera is still, only the particles move: draw at half rate; the particle clock keeps their speed.
  let lastDraw = 0;
  let lastInteraction = 0;
  const render = (now: number) => {
    frame = 0;
    const calm = !!flowLayer?.settled && now - lastInteraction > IDLE_MS;
    if (calm && now - lastDraw < CALM_FRAME_MS - FRAME_SLACK_MS) { requestRender(); return; }
    lastDraw = now;
    flowLayer?.frame(now, camera, canvas.clientHeight);
    renderer.render(scene, camera);
    projectAnchors();
    // Particles keep moving after the solver settles; the loop runs only while the tab is visible.
    if (flowLayer?.active && !document.hidden && onScreen) requestRender();
  };
  const requestRender = () => {
    if (!frame) frame = requestAnimationFrame(render);
  };
  controls.addEventListener('change', () => { lastInteraction = performance.now(); requestRender(); });
  const onVisibility = () => { if (!document.hidden) requestRender(); };
  document.addEventListener('visibilitychange', onVisibility);
  // A canvas scrolled out of view stops drawing, and starts again when it returns.
  let onScreen = true;
  const viewObserver = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
    onScreen = entries[entries.length - 1].isIntersecting;
    if (onScreen) requestRender();
  });
  viewObserver?.observe(canvas);

  const fit = (l: CaseLayout) => {
    const [ex, ey, ez] = caseExtents(l);
    const center = new Vector3(ex / 2, ey / 2, ez / 2);
    const radius = Math.hypot(ex, ey, ez) / 2;
    const dist = (radius * FIT_MARGIN) / Math.sin((camera.fov * Math.PI) / 360);
    camera.position.copy(center).addScaledVector(VIEW_DIRECTION, dist);
    controls.target.copy(center);
    controls.update();
  };

  const lineMaterials: LineMaterial[] = [];
  const clearCase = () => {
    staticGroup.children.forEach(child => disposeGroup(child as Group));
    staticGroup.clear();
    lineMaterials.length = 0;
  };

  const clear = (group: Group, list: { dispose: () => void }[]) => {
    group.clear();
    list.splice(0).forEach(d => d.dispose());
  };

  // The case is Build's own scene (lib/scene/pcScene), built from the same layout; the fans are this view's overlay.
  const buildStatic = (l: CaseLayout) => {
    clearCase();
    const palette: Palette = scenePalette(canvas);
    const [D, W, H] = l.size;
    const group = buildCase(sceneLayout(l), palette, lineMaterials, [], [], true, false, true, true);
    // Build centers the case on the origin; this view keeps the layout's own corner at the origin, where the fans and the solver are.
    const holder = new Group();
    holder.position.set(D / 2, H / 2, W / 2);
    holder.add(group);
    staticGroup.add(holder);
    lineMaterials.forEach(m => m.resolution.set(canvas.clientWidth, canvas.clientHeight));
    fit(l);
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
    lineMaterials.forEach(m => m.resolution.set(w, h));
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
      viewObserver?.disconnect();
      flowLayer?.dispose();
      flowLayer = null;
      controls.dispose();
      clearCase();
      clear(fanGroup, fanDisposables);
      renderer.forceContextLoss();
      renderer.dispose();
    },
  };
}
