import type { LedMapEntry } from '../../api/lighting';
import type { SceneAnchor, SceneBinding, SceneObject, Vec3 } from './sceneTypes';

/** The lighting canvas the engine samples, in its logical units. */
export const CANVAS_W = 1000;
export const CANVAS_H = 600;

/** A device's LED map laid on a surface: map point (u, v) sits at center + (u - 0.5) * axisU + (v - 0.5) * axisV. */
export interface SceneQuad {
  center: Vec3;
  axisU: Vec3;
  axisV: Vec3;
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const neg = (a: Vec3): Vec3 => [-a[0], -a[1], -a[2]];

function normalize(v: Vec3, fallback: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  return len < 1e-6 ? fallback : [v[0] / len, v[1] / len, v[2] / len];
}

/** Object-local direction to world, matching three.js rotation.y and the service's SceneMath.RotateYaw. */
export function rotateYaw(v: Vec3, yawDegrees: number): Vec3 {
  const r = (yawDegrees * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c * v[0] + s * v[2], v[1], -s * v[0] + c * v[2]];
}

export function toWorld(obj: SceneObject, local: Vec3): Vec3 {
  return add(rotateYaw(local, obj.yaw), obj.position);
}

/** Mirrors the service's SceneMath.AnchorQuad: the surface a device's map lies on after its turn and mirror. */
export function anchorQuad(obj: SceneObject, anchor: SceneAnchor, rotation: number, flip: boolean): SceneQuad {
  const right = normalize(anchor.right, [1, 0, 0]);
  const down = neg(normalize(anchor.up, [0, 1, 0]));
  const turn = Math.round((((rotation % 360) + 360) % 360) / 90) % 4;
  const [e1, e2] = turn === 1 ? [down, neg(right)] : turn === 2 ? [neg(right), neg(down)] : turn === 3 ? [neg(down), right] : [right, down];
  const lenU = turn % 2 === 0 ? anchor.width : anchor.height;
  const lenV = turn % 2 === 0 ? anchor.height : anchor.width;
  let axisU = scale(e1, lenU);
  if (flip) axisU = neg(axisU);
  const axisV = scale(e2, lenV);
  return {
    center: toWorld(obj, anchor.center),
    axisU: rotateYaw(axisU, obj.yaw),
    axisV: rotateYaw(axisV, obj.yaw),
  };
}

export function quadAt(q: SceneQuad, u: number, v: number): Vec3 {
  return add(q.center, add(scale(q.axisU, u - 0.5), scale(q.axisV, v - 0.5)));
}

/** Every bound device's surfaces in target order; a binding whose targets all miss is left out. */
export function placements(scene: { objects: SceneObject[]; bindings: SceneBinding[] }): Map<string, SceneQuad[]> {
  const objects = new Map(scene.objects.map(o => [o.id, o]));
  const out = new Map<string, SceneQuad[]>();
  for (const b of scene.bindings) {
    const quads: SceneQuad[] = [];
    for (const t of b.targets) {
      const obj = objects.get(t.objectId);
      const anchor = obj?.anchors.find(a => a.id === t.anchorId);
      if (obj && anchor) quads.push(anchorQuad(obj, anchor, b.rotation, b.flip));
    }
    if (quads.length > 0) out.set(b.deviceId, quads);
  }
  return out;
}

/**
 * Each LED's world position, the way the engine lays it out
 * (LightingEngine.SampleSceneDevice): LEDs split into equal runs per surface,
 * a split run's map stretched over its own surface, a device with no map
 * walking its surface's midline. Disabled LEDs come back as NaN.
 */
export function ledWorldPositions(ledCount: number, leds: LedMapEntry[] | null | undefined, quads: SceneQuad[]): Float32Array {
  const out = new Float32Array(ledCount * 3).fill(Number.NaN);
  if (ledCount <= 0 || quads.length === 0) return out;
  const byIndex = new Map<number, LedMapEntry>();
  for (const l of leds ?? []) byIndex.set(l.index, l);
  const hasUv = byIndex.size > 0;
  const runs = quads.length;
  for (let k = 0; k < runs; k++) {
    const lo = Math.floor((k * ledCount) / runs);
    const hi = Math.floor(((k + 1) * ledCount) / runs);
    const count = hi - lo;
    if (count <= 0) continue;
    let u0 = 0, uSpan = 1, v0 = 0, vSpan = 1;
    if (hasUv && runs > 1) {
      let u1 = -Infinity, v1 = -Infinity;
      u0 = Infinity;
      v0 = Infinity;
      for (let i = lo; i < hi; i++) {
        const l = byIndex.get(i);
        const u = l?.u ?? 0, v = l?.v ?? 0;
        u0 = Math.min(u0, u); u1 = Math.max(u1, u);
        v0 = Math.min(v0, v); v1 = Math.max(v1, v);
      }
      uSpan = u1 - u0;
      vSpan = v1 - v0;
    }
    for (let i = lo; i < hi; i++) {
      const l = byIndex.get(i);
      if (l?.disabled) continue;
      let u: number, v: number;
      if (hasUv) {
        u = uSpan > 1e-6 ? ((l?.u ?? 0) - u0) / uSpan : 0.5;
        v = vSpan > 1e-6 ? ((l?.v ?? 0) - v0) / vSpan : 0.5;
      } else {
        u = count > 1 ? (i - lo) / (count - 1) : 0.5;
        v = 0.5;
      }
      const p = quadAt(quads[k], u, v);
      out[i * 3] = p[0];
      out[i * 3 + 1] = p[1];
      out[i * 3 + 2] = p[2];
    }
  }
  return out;
}

/** Axis-aligned world bounds of every object, or null for an empty scene. */
export function sceneBounds(objects: SceneObject[]): { min: Vec3; max: Vec3 } | null {
  if (objects.length === 0) return null;
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const o of objects) {
    const [w, h, d] = o.size;
    for (const sx of [-0.5, 0.5]) {
      for (const sz of [-0.5, 0.5]) {
        for (const y of [0, h]) {
          const p = toWorld(o, [sx * w, y, sz * d]);
          for (let i = 0; i < 3; i++) {
            min[i] = Math.min(min[i], p[i]);
            max[i] = Math.max(max[i], p[i]);
          }
        }
      }
    }
  }
  return { min, max };
}
