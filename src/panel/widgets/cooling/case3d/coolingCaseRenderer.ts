import {
  ArrowHelper, BoxGeometry, BufferGeometry, Color, DoubleSide, PlaneGeometry, ShaderMaterial, Float32BufferAttribute, Group, LineBasicMaterial, LineDashedMaterial, LineLoop,
  Material, Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, Scene, Vector2, Vector3, WebGLRenderer,
} from 'three';
import type { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { caseExtents, fanGeometries, RADIATOR_PICK_KEY, sceneLayout, type CaseBox, type CaseLayout } from '../../../../lib/cooling/caseLayout';
import { fanRadii } from '../../../../lib/cooling/fanGeometry';
import type { FanDirection } from '../../../../lib/cooling/pressureModel';
import type { PickModifiers } from '../../../../lib/cooling/fanSelection';
import { advanceRotor, ROTOR_BLADES, type RotorSpin } from '../../../../lib/cooling/rotorSpin';
import { buildCase, coolingPalette, disposeGroup, type Palette } from '../../../../lib/scene/pcScene';
import { DEV_TOOLS } from '../../../../lib/devTools';
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
  /** True while devices are selected in the list, even when none is bound to a fan: unhighlighted fans then dim. */
  filtering?: boolean;
  /** Every selected fan: each one is emphasised and shows its direction arrow. */
  selected?: ReadonlySet<string>;
  /** Airflow simulation input; null leaves the flow layer empty. */
  flow: FlowInput | null;
  flowOptions: FlowOptions;
  /** Fans that get a spinning rotor, by slot key, with the rpm to spin at. */
  rotors?: ReadonlyMap<string, number>;
}

/** A point in layout mm to follow on screen. */
export interface PointAnchor {
  key: string;
  at: HeatAnchor['at'];
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
  /** Points to follow on screen; `onProject` runs after each drawn frame with their canvas positions by key. Each `owner` keeps its own set, so independent overlays never replace one another. */
  setAnchors: (anchors: readonly PointAnchor[], onProject: (positions: Record<string, ProjectedAnchor>) => void, owner?: string) => void;
  /** Receives the airflow color span in degrees whenever it moves enough to change a legend; null stops it. */
  setSpanListener: (listener: ((spanK: number) => void) | null) => void;
  /** Receives true while the airflow solve is still settling (a solve in progress with the particles on), false once it is steady; null stops it. */
  setSettlingListener: (listener: ((settling: boolean) => void) | null) => void;
  resize: () => void;
  dispose: () => void;
  /** False once a layer has found no float render target: the airflow layer cannot run here. */
  readonly flowSupported: boolean;
  /** The orbit camera, so a caller can read the view the user left. */
  readonly camera: PerspectiveCamera;
}

/** A click that lands on a fan slot or on nothing; x and y are CSS pixels inside the canvas. */
export type PickHandler = (slotKey: string | null, x: number, y: number, mods?: PickModifiers) => void;

const CLICK_SLOP_PX = 4;
/** How far the case and its parts are drawn back while the airflow runs, so the fans and the air read first. */
export const AIRFLOW_DIM = 0.2;
/** The case drawn on its own: still drawn back, but brighter than behind the airflow. */
export const CASE_ONLY_DIM = 0.6;
/** A still camera for this long, and a settled flow, lets the view draw at a reduced rate. */
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

/**
 * A card's fan slot box spans the whole card, so its center is inside the card's solid, which hides a ring drawn there.
 * The distance along the ring axis from the box center to the card face the fan draws air in through; 0 for every other slot, whose box is the fan itself.
 */
export function ringFaceShift(slotKey: string, thickness: number, into: number): number {
  return slotKey.startsWith('gpu:') && into !== 0 ? -Math.sign(into) * (thickness / 2) : 0;
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

const ROTOR_DOTS = 12;
const ROTOR_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// A flat rotor drawn per pixel: swept blades that start just outside the hub circle, a centre dot on a chosen fan, and blades that melt into a soft disc at speed.
const ROTOR_FRAGMENT = /* glsl */ `
uniform vec3 uColor; uniform float uSelected; uniform float uAngle; uniform float uBlur; uniform float uOpacity; uniform float uDotted;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float f = fract((atan(p.y, p.x) - uAngle) * ${ROTOR_BLADES}.0 / 6.2831853 - r * 0.9);
  float blade = smoothstep(0.0, 0.05, f) * (1.0 - smoothstep(0.59, 0.64, f));
  blade = mix(blade, 0.4, uBlur) * smoothstep(0.41, 0.44, r) * (1.0 - smoothstep(0.93, 1.0, r));
  blade *= mix(1.0, smoothstep(0.3, 0.4, fract(r * ${ROTOR_DOTS}.0)) * (1.0 - smoothstep(0.7, 0.8, fract(r * ${ROTOR_DOTS}.0))), uDotted);
  float centre = 1.0 - smoothstep(0.09, 0.11, r);
  gl_FragColor = vec4(uColor, max(blade, uSelected * centre) * uOpacity);
  gl_FragColor = linearToOutputTexel(gl_FragColor);
}`;
const ROTOR_OPACITY = 0.4;
/** The rotor shader material; a simulated fan's blades are dotted along their length. */
export function rotorMaterial(color: Color, chosen: boolean, rpm: number, dotted: boolean): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: ROTOR_VERTEX, fragmentShader: ROTOR_FRAGMENT, transparent: true, depthWrite: false, side: DoubleSide,
    uniforms: { uColor: { value: color.clone() }, uSelected: { value: chosen ? 1 : 0 }, uAngle: { value: 0 }, uBlur: { value: rotorBlur(rpm) }, uOpacity: { value: ROTOR_OPACITY }, uDotted: { value: dotted ? 1 : 0 } },
  });
}
/** Visual turns a second for a fan at `rpm`: it rises with the speed but levels off, so a fast fan does not strobe at the display rate. */
export const rotorTurnsPerSecond = (rpm: number): number => 1.4 * (1 - Math.exp(-Math.max(0, rpm) / 1200));
/** How much the blades melt into a disc: none for slow fans, most for the fastest. */
export const rotorBlur = (rpm: number): number => 0.4 * Math.min(1, Math.max(0, (rpm - 2200) / 1400));

/** `onDrag` runs when a press ends after the pointer moved past a click's slop: an orbit or pan, which moves the picture under any open controls. */
export function createCaseRenderer(canvas: HTMLCanvasElement, onPick: PickHandler, onDrag?: () => void): CaseSceneRenderer {
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
  const anchorSets = new Map<string, { anchors: readonly PointAnchor[]; onProject: (positions: Record<string, ProjectedAnchor>) => void; projected: Record<string, ProjectedAnchor> }>();
  let collisionsOn = false;
  let spanListener: ((spanK: number) => void) | null = null;
  let settlingListener: ((settling: boolean) => void) | null = null;
  let showCase = true;
  // The case and parts are always drawn back: further while the particles run.
  let caseDim = AIRFLOW_DIM;
  // The collision view stands in for the case; Airflow hides the case and the fans.
  const applyVisibility = () => {
    staticGroup.visible = showCase && !collisionsOn;
    fanGroup.visible = showCase;
  };

  const fanDisposables: { dispose: () => void }[] = [];
  const raycaster = new Raycaster();
  let hitMeshes: Mesh[] = [];
  // Spinning rotors: the material, its rpm and the sign of the spin, advanced each frame. Each fan's angle and turn rate live on in `spins` when the scene is rebuilt, so a change of rpm or selection never restarts a rotor.
  const rotors: { key: string; material: ShaderMaterial; rpm: number; sign: number }[] = [];
  const spins = new Map<string, RotorSpin>();
  let lastSpin = 0;
  let layout: CaseLayout | null = null;
  let frame = 0;

  // Reused every frame: the vector each anchor is projected through, and each set's own projected positions.
  const scratch = new Vector3();
  const projectAnchors = () => {
    if (anchorSets.size === 0) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    for (const set of anchorSets.values()) {
      for (const a of set.anchors) {
        const v = scratch.set(a.at[0], a.at[1], a.at[2]).project(camera);
        const x = (v.x * 0.5 + 0.5) * w;
        const y = (-v.y * 0.5 + 0.5) * h;
        const entry = set.projected[a.key] ?? (set.projected[a.key] = { x: 0, y: 0, visible: false });
        entry.x = x;
        entry.y = y;
        entry.visible = v.z < 1 && x >= 0 && x <= w && y >= 0 && y <= h;
      }
      set.onProject(set.projected);
    }
  };

  // Once the air has settled (or no air is drawn) and the camera is still, only particles and rotors move: draw at a reduced rate; both are timed by the clock.
  let lastDraw = 0;
  let lastInteraction = 0;
  const render = (now: number) => {
    frame = 0;
    const calm = (flowLayer ? flowLayer.settled || !flowLayer.active : true) && now - lastInteraction > IDLE_MS;
    if (calm && now - lastDraw < CALM_FRAME_MS - FRAME_SLACK_MS) { requestRender(); return; }
    lastDraw = now;
    const spinDt = lastSpin ? Math.min(100, now - lastSpin) : 0;
    lastSpin = now;
    for (const r of rotors) {
      const spin = advanceRotor(spins.get(r.key), spinDt / 1000, rotorTurnsPerSecond(r.rpm), r.sign);
      spins.set(r.key, spin);
      r.material.uniforms.uAngle.value = spin.angle;
    }
    flowLayer?.frame(now, camera, canvas.clientHeight);
    renderer.render(scene, camera);
    projectAnchors();
    // Particles keep moving after the solver settles; the loop runs only while the tab is visible.
    if ((flowLayer?.active || rotors.some(r => r.rpm > 0)) && !document.hidden && onScreen) requestRender();
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
  // Dev tools: what the case drawing is made of, for reading from a live page.
  const caseDebug = () => {
    const faces: number[] = [];
    staticGroup.traverse(o => { const m = (o as Mesh).material as Material | undefined; if (m && !Array.isArray(m) && (m as MeshBasicMaterial).colorWrite !== false && m.transparent) faces.push(m.opacity); });
    const mean = (a: number[]) => (a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(3) : 0);
    const lines = lineMaterials.map(m => m.opacity);
    return { dim: caseDim, lineCount: lines.length, lineOpacityMean: mean(lines), lineOpacityMax: lines.length ? Math.max(...lines) : 0, lineWidthMean: mean(lineMaterials.map(m => m.linewidth)), faceCount: faces.length, faceOpacityMean: mean(faces) };
  };
  if (DEV_TOOLS) (globalThis as { __nexusCaseDebug?: unknown }).__nexusCaseDebug = caseDebug;
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
  const buildStatic = (l: CaseLayout, refit: boolean) => {
    clearCase();
    const palette: Palette = coolingPalette(canvas);
    const [D, W, H] = l.size;
    const group = buildCase(sceneLayout(l), palette, lineMaterials, [], [], true, false, true, true, true, caseDim);
    // Build centers the case on the origin; this view keeps the layout's own corner at the origin, where the fans and the solver are.
    const holder = new Group();
    holder.position.set(D / 2, H / 2, W / 2);
    holder.add(group);
    staticGroup.add(holder);
    lineMaterials.forEach(m => m.resolution.set(canvas.clientWidth, canvas.clientHeight));
    if (refit) fit(l);
  };

  const buildFans = (state: CaseSceneState) => {
    clear(fanGroup, fanDisposables);
    hitMeshes = [];
    rotors.length = 0;
    const l = state.layout;
    const [ex, ey, ez] = caseExtents(l);
    const caseCenter = new Vector3(ex / 2, ey / 2, ez / 2);
    const intake = token(canvas, '--airflow-cool', '#38bdf8');
    const exhaust = token(canvas, '--bad', '#ef4444');
    const picking = state.filtering === true || state.highlighted.size > 0 || state.active !== null || (state.selected?.size ?? 0) > 0;
    for (const { slot, box } of fanGeometries(l)) {
      const occupied = slot.taken === 'fan';
      const dir = state.directions[slot.key] ?? 'intake';
      const color = dir === 'intake' ? intake : exhaust;
      const chosen = state.active === slot.key || !!state.selected?.has(slot.key);
      const emphasised = state.highlighted.has(slot.key) || chosen;
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
      const faceShift = ringFaceShift(slot.key, box.size[axisIndex], localGiven ? localGiven[axis] : 0);
      // Tip ring and hub ring: the air moves through the open ring between them.
      // The tip and hub rings are the fan's own lines, as ever; a chosen fan adds the centre dot and the arrow.
      for (const r of [radii.tip, radii.hub * 0.85]) {
        const geo = ringGeometry(r, axis);
        fanDisposables.push(geo);
        const mat = ringMaterial(color, emphasised ? 1 : opacity * (picking ? DIMMED : 1), r, state.simulated.has(slot.key));
        mat.depthTest = !emphasised;
        fanDisposables.push(mat);
        const ring = new LineLoop(geo, mat);
        ring.position[axis] = faceShift;
        if (mat instanceof LineDashedMaterial) ring.computeLineDistances();
        group.add(ring);
      }
      const rpm = state.rotors?.get(slot.key);
      if (rpm !== undefined) {
        const material = rotorMaterial(color, chosen, rpm, state.simulated.has(slot.key));
        const geometry = new PlaneGeometry(2, 2);
        const blades = new Mesh(geometry, material);
        blades.scale.set(radii.tip * 0.96, radii.tip * 0.96, 1);
        // The plane lies across the fan's axis, with its normal along it.
        if (axis === 'x') blades.rotation.y = Math.PI / 2; else if (axis === 'y') blades.rotation.x = -Math.PI / 2;
        blades.position[axis] = faceShift;
        blades.renderOrder = 3;
        fanDisposables.push(geometry, material);
        group.add(blades);
        // The rotor turns the way that drives the air along the flow.
        const flowLocal = (given ?? AXES[axis]).clone().multiplyScalar(dir === 'intake' ? 1 : -1).applyAxisAngle(AXES.y, -(box.rotationY ?? 0));
        const held = spins.get(slot.key);
        material.uniforms.uAngle.value = held?.angle ?? 0;
        rotors.push({ key: slot.key, material, rpm, sign: Math.sign(flowLocal[axis]) || 1 });
      }
      fanGroup.add(group);

      // Only a chosen fan shows its direction arrow, drawn over every part so no component hides it.
      if (chosen) {
        const world = AXES[axis].clone().applyAxisAngle(AXES.y, box.rotationY ?? 0);
        const inward = given ?? world.clone().multiplyScalar(caseCenter.clone().sub(center).dot(world) >= 0 ? 1 : -1);
        const flow = inward.clone().multiplyScalar(dir === 'intake' ? 1 : -1);
        const length = diameter * 0.9;
        const arrow = new ArrowHelper(flow, center.clone().addScaledVector(flow, -length / 2), length, color.getHex(), length * 0.3, length * 0.18);
        for (const m of [arrow.line.material, arrow.cone.material] as Material[]) {
          m.transparent = true;
          m.opacity = occupied ? 0.95 : 0.35;
          m.depthWrite = false;
          m.depthTest = false;
          fanDisposables.push(m);
        }
        arrow.line.renderOrder = 10;
        arrow.cone.renderOrder = 10;
        fanDisposables.push(arrow.line.geometry, arrow.cone.geometry);
        fanGroup.add(arrow);
      }

      // The fan's body is not drawn: the rotor and rings are the fan. Its pick box below stays, invisible but hit by the raycaster.

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
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_SLOP_PX) {
      if (down) onDrag?.();
      down = null;
      return;
    }
    down = null;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    raycaster.setFromCamera(new Vector2((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1), camera);
    // A fan wins over the radiator box it sits against.
    const hits = showCase ? raycaster.intersectObjects(hitMeshes, false) : [];
    const hit = hits.find(h => h.object.userData.slotKey !== RADIATOR_PICK_KEY) ?? hits[0];
    onPick(typeof hit?.object.userData.slotKey === 'string' ? hit.object.userData.slotKey : null, x, y, { toggle: e.ctrlKey || e.metaKey, add: e.shiftKey });
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
      const dimNow = state.flowOptions.particles ? AIRFLOW_DIM : CASE_ONLY_DIM;
      const dimChanged = dimNow !== caseDim;
      caseDim = dimNow;
      if (state.layout === layout && dimChanged && layout) buildStatic(layout, false);
      if (state.layout !== layout) {
        const previous = layout;
        layout = state.layout;
        const extents = caseExtents(state.layout);
        const reshaped = !previous || caseExtents(previous).some((v, i) => v !== extents[i]);
        // The camera frames the case once and again only for a different case shape: a fan edit or radiator move rebuilds the layout object but keeps the view.
        buildStatic(state.layout, reshaped);
        // The flow layer lives as long as the case shape: a fan edit changes the layout object but keeps the field and the particles.
        if (!flowLayer || reshaped) {
          flowLayer?.dispose();
          flowInput = null;
          const [ex, ey, ez] = extents;
          const colors: FlowColors = {
            cool: token(canvas, '--airflow-cool', '#38bdf8'), purple: token(canvas, '--airflow-purple', '#a53cff'), hot: token(canvas, '--bad', '#ef4444'),
            collision: token(canvas, '--bad', '#ef4444'), porous: token(canvas, '--airflow-cool', '#38bdf8'),
          };
          flowLayer = new FlowLayer(renderer, flowGroup, new Vector3(ex, ey, ez), colors);
          flowLayer.onSpan = spanListener;
          flowLayer.setSettlingListener(settlingListener);
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
    setAnchors(next, cb, owner = 'default') {
      if (next.length === 0) anchorSets.delete(owner);
      else anchorSets.set(owner, { anchors: next, onProject: cb, projected: {} });
      requestRender();
    },
    setSpanListener(listener) {
      spanListener = listener;
      if (flowLayer) flowLayer.onSpan = listener;
    },
    setSettlingListener(listener) {
      settlingListener = listener;
      if (flowLayer) flowLayer.setSettlingListener(listener);
      else listener?.(false);
    },
    camera,
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
      if (DEV_TOOLS) {
        const globals = globalThis as { __nexusCaseDebug?: unknown };
        if (globals.__nexusCaseDebug === caseDebug) delete globals.__nexusCaseDebug;
      }
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
