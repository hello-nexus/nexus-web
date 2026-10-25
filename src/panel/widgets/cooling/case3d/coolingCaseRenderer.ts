import {
  ArrowHelper, BoxGeometry, BufferGeometry, Color, EdgesGeometry, Float32BufferAttribute, Group, LineBasicMaterial, LineLoop,
  LineSegments, Material, Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, Scene, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { caseExtents, fanGeometries, type CaseBox, type CaseLayout } from '../../../../lib/cooling/caseLayout';
import { fanRadii } from '../../../../lib/cooling/fanGeometry';
import type { FanDirection } from '../../../../lib/cooling/pressureModel';
import { parseCaseModel, sceneToLayoutMatrix, styleCaseModel } from '../../../../lib/scene/caseModel';
import { FlowLayer, type FlowColors, type FlowOptions } from '../../../../lib/cooling/flow/flowLayer';
import type { FlowInput } from '../../../../lib/cooling/flow/gridScene';

export interface CaseSceneState {
  layout: CaseLayout;
  /** Direction of every fan slot, by slot key. */
  directions: Readonly<Record<string, FanDirection>>;
  /** Slots of the channel selected on the left. */
  highlighted: ReadonlySet<string>;
  /** Slots bound to any channel. */
  bound: ReadonlySet<string>;
  /** The slot whose direction control is open. */
  active: string | null;
  /** Airflow simulation input; null leaves the flow layer empty. */
  flow: FlowInput | null;
  flowOptions: FlowOptions;
  /** Build's exported case model (binary glTF); when present it replaces the outline of the layout's boxes. */
  model: ArrayBuffer | null;
}

export interface CaseSceneRenderer {
  setState: (state: CaseSceneState) => void;
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
  let modelBytes: ArrayBuffer | null = null;
  let modelFor: CaseLayout | null = null;
  let modelToken = 0;
  let modelGroup: Group | null = null;
  let modelStyle: { dispose: () => void } | null = null;
  let disposed = false;
  let collisionsOn = false;
  // The collision view stands in for both the model and the outline.
  const applyVisibility = () => {
    staticGroup.visible = !modelGroup && !collisionsOn;
    if (modelGroup) modelGroup.visible = !collisionsOn;
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
    modelFor = forLayout;
    if (!bytes) { clearModel(); requestRender(); return; }
    let parsed: Group;
    try {
      parsed = await parseCaseModel(bytes);
    } catch {
      if (token === modelToken && !disposed) clearModel();
      return;
    }
    if (token !== modelToken || disposed) {
      parsed.traverse(o => { (o as Mesh).geometry?.dispose(); });
      return;
    }
    clearModel();
    const holder = new Group();
    holder.applyMatrix4(sceneToLayoutMatrix(forLayout.size, forLayout.windowRight === true));
    holder.add(parsed);
    modelStyle = styleCaseModel(parsed, token_('--text-dim', '#8a93a6'), token_('--text-dim', '#8a93a6'));
    modelGroup = holder;
    scene.add(holder);
    applyVisibility();
    requestRender();
  };
  const token_ = (name: string, fallback: string) => token(canvas, name, fallback);
  const disposables: { dispose: () => void }[] = [];
  const fanDisposables: { dispose: () => void }[] = [];
  const raycaster = new Raycaster();
  let hitMeshes: Mesh[] = [];
  let layout: CaseLayout | null = null;
  let frame = 0;

  const render = (now: number) => {
    frame = 0;
    flowLayer?.frame(now, camera, canvas.clientHeight);
    renderer.render(scene, camera);
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

  const buildFans = (state: CaseSceneState) => {
    clear(fanGroup, fanDisposables);
    hitMeshes = [];
    const l = state.layout;
    const [ex, ey, ez] = caseExtents(l);
    const caseCenter = new Vector3(ex / 2, ey / 2, ez / 2);
    const intake = token(canvas, '--airflow-cool', '#38bdf8');
    const exhaust = token(canvas, '--bad', '#ef4444');
    const highlight = token(canvas, '--text', '#e6e9f0');
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
        group.add(new LineLoop(geo, lineMaterial(emphasised ? highlight : color, emphasised ? 1 : opacity, fanDisposables)));
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
    const hit = raycaster.intersectObjects(hitMeshes, false)[0];
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
        }
      }
      buildFans(state);
      if (state.model !== modelBytes || (modelFor !== state.layout && state.model)) void showModel(state.model, state.layout);
      flowLayer?.setOptions(state.flowOptions);
      if (collisionsOn !== state.flowOptions.collisions) { collisionsOn = state.flowOptions.collisions; applyVisibility(); }
      if (state.flow !== flowInput) {
        flowInput = state.flow;
        flowLayer?.setInput(state.flow);
      }
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
      renderer.forceContextLoss();
      renderer.dispose();
    },
  };
}
