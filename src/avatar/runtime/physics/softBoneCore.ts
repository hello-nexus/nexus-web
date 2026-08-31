/**
 * EZSoftBone solver core - a faithful TypeScript port of EZhex1991/EZSoftBone
 * (MIT), operating directly on three.js Object3D hierarchies in world space.
 *
 * C# -> TS mapping:
 *   EZSoftBone.Bone ctor            -> buildNode
 *   EZSoftBone.SetSiblings(+ByDepth)-> SoftBoneSystem.setSiblings / setSiblingsByDepth
 *   Bone.SetLeftSibling/RightSibling-> SoftBoneNode.setLeftSibling/setRightSibling
 *   Bone.Inflate(material)          -> inflateNode (+ evaluateCurve for AnimationCurve.Evaluate)
 *   EZSoftBoneMaterial.Get*         -> evaluateCurve applied over base values (precomputed;
 *                                      the exported material is immutable at runtime)
 *   EZSoftBone.Update (Revert)      -> SoftBoneSystem.revertNode (see note below)
 *   EZSoftBone.UpdateStructures     -> SoftBoneSystem.step
 *   EZSoftBone.UpdateBones          -> SoftBoneSystem.updateBones
 *   EZSoftBone.UpdateTransforms     -> SoftBoneSystem.writeTransforms
 *   Bone.UpdateTransform            -> SoftBoneSystem.writeNode (+ applyWorldRotation, siblingDelta)
 *   Bone.SetRestState               -> SoftBoneSystem.seedNode (OnEnable / unfreeze)
 *   Bone.RevertTransforms           -> SoftBoneSystem.revertToRest (OnDisable / freeze)
 *
 * Ordering: SoftBoneSystem.update(dt) must run AFTER the AnimationMixer has
 * written this frame's bone locals - the three.js equivalent of EZSoftBone
 * running in LateUpdate after the Animator.
 *
 * Unity ordering nuance handled by revertNode: Unity reverts sim-owned locals
 * in Update() and the Animator re-poses them BEFORE LateUpdate. Here the mixer
 * has already run when update(dt) starts, so a local that still holds exactly
 * the value we wrote last frame was NOT animated and is reverted to its
 * captured rest local; a local the mixer rewrote is kept as the animated pose.
 *
 * Intentionally omitted (not exported for v1 packs, all default/null in the
 * reference prefab): simulateSpace (sim is plain world space), gravityAligner,
 * forceModule/customForce, endBones, lengthUnification. Collision is a seam:
 * see SoftBoneCollider (v1 exports radius 0 and no colliders).
 *
 * Update-path discipline: zero allocations. All scratch objects live at module
 * scope, hot loops are indexed, and there are no per-frame closures.
 */

import { Matrix3, Matrix4, Quaternion, Vector3 } from 'three';
import type { Object3D } from 'three';

/** Mirrors EZSoftBone.DeltaTime_Min. */
export const DELTA_TIME_MIN = 1e-6;

/** Pre-sampled Unity AnimationCurve: [t, value] pairs, t ascending in 0..1. */
export type SoftBoneCurve = ReadonlyArray<readonly [number, number]>;

/** EZSoftBoneMaterial: base value * curve.Evaluate(normalizedLength) per node. */
export interface SoftBoneMaterialParams {
  damping: number;
  dampingCurve: SoftBoneCurve;
  stiffness: number;
  stiffnessCurve: SoftBoneCurve;
  resistance: number;
  resistanceCurve: SoftBoneCurve;
  slackness: number;
  slacknessCurve: SoftBoneCurve;
}

/** EZSoftBone.UnificationMode for sibling link construction. */
export type SiblingMode = 'none' | 'rooted' | 'unified';

/**
 * 'variable': step once with dt clamped to maxDeltaTime (Unity DeltaTime mode
 * with a hitch guard). 'constant': fixed-timestep accumulator stepping
 * constantDeltaTime; note Unity's Constant mode instead steps exactly once per
 * rendered frame, so its sim speed scales with framerate - the accumulator is
 * the real-time-correct interpretation of the same step size.
 */
export type DeltaTimeMode = 'variable' | 'constant';

/**
 * Collision seam. EZSoftBone.UpdateBones iterates
 * EZSoftBoneColliderBase.EnabledColliders + extraColliders when bone.radius > 0;
 * sphere/capsule ports implement this interface (mutating `position` in place,
 * like the C# `ref Vector3`) and register via SoftBoneSystem's colliders array.
 * v1 packs export radius 0 and no colliders, so the hook stays dormant.
 */
export interface SoftBoneCollider {
  collide(position: Vector3, radius: number): void;
}

export interface SoftBoneSystemConfig {
  /** World-space force, already in three.js (glTF) handedness. */
  gravity: readonly [number, number, number];
  iterations: number;
  deltaTimeMode: DeltaTimeMode;
  constantDeltaTime: number;
  /** Clamp for 'variable' mode. */
  maxDeltaTime: number;
  /** Catch-up cap per update for 'constant' mode; backlog beyond it is dropped. */
  maxSubSteps: number;
  sleepThreshold: number;
  startDepth: number;
  /** Link topology (m_SiblingConstraints); 'none' builds no links, like the reference prefab. */
  siblingMode: SiblingMode;
  closedSiblings: boolean;
  /** Gates the sibling rotation pass in writeNode (m_SiblingRotationConstraints). */
  siblingRotationConstraints: boolean;
  /** Base collider radius (m_Radius); v1 exports use 0 and a constant-1 radius curve. */
  radius: number;
  material: SoftBoneMaterialParams;
}

// --- helpers ---------------------------------------------------------------

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Linear interpolation over pre-sampled curve points (the exporter samples the
 * Unity AnimationCurve densely; hermite tangents are approximated by lerp).
 */
export function evaluateCurve(curve: SoftBoneCurve, t: number): number {
  const n = curve.length;
  if (n === 0) return 1; // neutral multiplier; exporters always emit samples
  if (t <= curve[0][0]) return curve[0][1];
  if (t >= curve[n - 1][0]) return curve[n - 1][1];
  for (let i = 1; i < n; i++) {
    if (t <= curve[i][0]) {
      const t0 = curve[i - 1][0];
      const v0 = curve[i - 1][1];
      const span = curve[i][0] - t0;
      const k = span > 0 ? (t - t0) / span : 0;
      return v0 + (curve[i][1] - v0) * k;
    }
  }
  return curve[n - 1][1];
}

const _ftFrom = new Vector3();
const _ftTo = new Vector3();

/** Unity Quaternion.FromToRotation (inputs need not be normalized). */
function fromToRotation(from: Vector3, to: Vector3, out: Quaternion): Quaternion {
  const fl = from.lengthSq();
  const tl = to.lengthSq();
  if (fl < 1e-12 || tl < 1e-12) return out.identity();
  _ftFrom.copy(from).multiplyScalar(1 / Math.sqrt(fl));
  _ftTo.copy(to).multiplyScalar(1 / Math.sqrt(tl));
  return out.setFromUnitVectors(_ftFrom, _ftTo);
}

/** Unity Quaternion.Lerp: shortest-path normalized lerp. */
function nlerpQuaternions(a: Quaternion, b: Quaternion, t: number, out: Quaternion): Quaternion {
  let bx = b.x;
  let by = b.y;
  let bz = b.z;
  let bw = b.w;
  if (a.x * bx + a.y * by + a.z * bz + a.w * bw < 0) {
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  return out
    .set(a.x + (bx - a.x) * t, a.y + (by - a.y) * t, a.z + (bz - a.z) * t, a.w + (bw - a.w) * t)
    .normalize();
}

/** Unity Vector3.Normalize semantics: near-zero vectors become zero, not NaN. */
function normalizeSafe(v: Vector3): Vector3 {
  const len = v.length();
  return len > 1e-5 ? v.multiplyScalar(1 / len) : v.set(0, 0, 0);
}

const _cwLocal = new Matrix4();

/**
 * World matrix composed by walking locals up to the scene root, so the result
 * is current even when the mixer just wrote locals and three's lazily-updated
 * matrixWorld is still stale (it refreshes during render). softBoneColliders
 * carries its own copy of this walk (type-only imports keep that file loadable
 * under plain node for the test harness).
 */
function composeWorldMatrix(obj: Object3D, out: Matrix4): Matrix4 {
  const parent = obj.parent;
  if (parent !== null) {
    composeWorldMatrix(parent, out);
    _cwLocal.compose(obj.position, obj.quaternion, obj.scale);
    out.multiply(_cwLocal);
  } else {
    out.compose(obj.position, obj.quaternion, obj.scale);
  }
  return out;
}

/** World rotation by the same walk (valid for shear-free TRS hierarchies). */
function composeWorldRotation(obj: Object3D, out: Quaternion): Quaternion {
  const parent = obj.parent;
  if (parent !== null) {
    composeWorldRotation(parent, out);
    out.multiply(obj.quaternion);
  } else {
    out.copy(obj.quaternion);
  }
  return out;
}

// --- bone tree ---------------------------------------------------------------

/** Port of EZSoftBone's private Bone class (state only; behavior lives on the system). */
class SoftBoneNode {
  readonly object: Object3D;
  readonly parentNode: SoftBoneNode | null;
  readonly childNodes: SoftBoneNode[] = [];
  readonly depth: number;

  boneLength = 0;
  treeLength = 0;
  normalizedLength = 0;

  /** Authored locals captured at build (Unity captures at Awake). */
  readonly restLocalPosition = new Vector3();
  readonly restLocalRotation = new Quaternion();

  /** Sibling links; offsets are node-local captures of the sibling position. */
  leftNode: SoftBoneNode | null = null;
  readonly leftPosition = new Vector3();
  rightNode: SoftBoneNode | null = null;
  readonly rightPosition = new Vector3();

  /** Curve-scaled per-node values (Bone.Inflate). */
  radius = 0;
  damping = 0;
  stiffness = 0;
  resistance = 0;
  slackness = 0;

  /** Simulation state, world space. */
  readonly worldPosition = new Vector3();
  readonly speed = new Vector3();

  /** Animated-pose snapshot for the current update (Unity reads transforms live). */
  readonly animWorldMatrix = new Matrix4();
  readonly animWorldPosition = new Vector3();

  /** Transform-write pass state (world after this frame's writes). */
  readonly updatedWorldMatrix = new Matrix4();
  readonly updatedWorldRotation = new Quaternion();

  /**
   * Exact locals written by the last write pass; lets revertNode distinguish
   * stale sim output (revert to rest) from a mixer-animated local (keep).
   */
  hasWrittenRotation = false;
  readonly lastWrittenRotation = new Quaternion();
  hasWrittenPosition = false;
  readonly lastWrittenPosition = new Vector3();

  constructor(object: Object3D, parentNode: SoftBoneNode | null, depth: number) {
    this.object = object;
    this.parentNode = parentNode;
    this.depth = depth;
  }

  /** Bone.SetLeftSibling: capture the sibling offset in this node's local space. */
  setLeftSibling(left: SoftBoneNode): void {
    if (left === this || left === this.rightNode) return;
    this.leftNode = left;
    _m4b.copy(this.animWorldMatrix).invert();
    this.leftPosition.copy(left.worldPosition).applyMatrix4(_m4b);
  }

  /** Bone.SetRightSibling. */
  setRightSibling(right: SoftBoneNode): void {
    if (right === this || right === this.leftNode) return;
    this.rightNode = right;
    _m4b.copy(this.animWorldMatrix).invert();
    this.rightPosition.copy(right.worldPosition).applyMatrix4(_m4b);
  }
}

/**
 * Port of the EZSoftBone.Bone constructor recursion: capture rest locals and
 * build-pose worlds, accumulate boneLength/treeLength, derive normalizedLength.
 */
function buildNode(
  object: Object3D,
  parentNode: SoftBoneNode | null,
  startDepth: number,
  depth: number,
  nodeLength: number,
  parentBoneLength: number,
): SoftBoneNode {
  const node = new SoftBoneNode(object, parentNode, depth);
  composeWorldMatrix(object, node.animWorldMatrix);
  node.animWorldPosition.setFromMatrixPosition(node.animWorldMatrix);
  node.worldPosition.copy(node.animWorldPosition);
  node.restLocalPosition.copy(object.position);
  node.restLocalRotation.copy(object.quaternion);
  if (depth > startDepth) node.boneLength = parentBoneLength + nodeLength;
  node.treeLength = node.boneLength;
  const children = object.children;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (!child.visible) continue; // Unity skips !activeSelf children
    composeWorldMatrix(child, _m4a);
    _va.setFromMatrixPosition(_m4a);
    const childNodeLength = _va.distanceTo(node.animWorldPosition);
    const childNode = buildNode(child, node, startDepth, depth + 1, childNodeLength, node.boneLength);
    node.childNodes.push(childNode);
    node.treeLength = Math.max(node.treeLength, childNode.treeLength);
  }
  node.normalizedLength = node.treeLength === 0 ? 0 : node.boneLength / node.treeLength;
  return node;
}

// --- module scratch (never allocated in the update path) --------------------

const _m4a = new Matrix4();
const _m4b = new Matrix4();
const _m3 = new Matrix3();
const _qa = new Quaternion();
const _qb = new Quaternion();
const _qc = new Quaternion();
const _qd = new Quaternion();
const _va = new Vector3();
const _old = new Vector3();
const _new = new Vector3();
const _force = new Vector3();
const _expected = new Vector3();
const _dir = new Vector3();
const _tmp = new Vector3();
const _tmp2 = new Vector3();

// --- system ------------------------------------------------------------------

export class SoftBoneSystem {
  private readonly host: Object3D;
  private readonly gravity = new Vector3();
  private readonly iterations: number;
  private readonly deltaTimeMode: DeltaTimeMode;
  private readonly constantDeltaTime: number;
  private readonly maxDeltaTime: number;
  private readonly maxSubSteps: number;
  private readonly sleepThreshold: number;
  private readonly startDepth: number;
  private readonly siblingMode: SiblingMode;
  private readonly siblingRotationConstraints: boolean;
  private readonly colliders: readonly SoftBoneCollider[];

  private readonly structures: SoftBoneNode[] = [];
  /** Animated world of each structure root's PARENT (ancestors are never sim-written). */
  private readonly structureParentWorld: Matrix4[] = [];
  private readonly structureParentRotation: Quaternion[] = [];

  private frozen = false;
  private accumulator = 0;

  constructor(
    host: Object3D,
    chainRoots: readonly Object3D[],
    config: SoftBoneSystemConfig,
    colliders: readonly SoftBoneCollider[] = [],
  ) {
    this.host = host;
    this.gravity.set(config.gravity[0], config.gravity[1], config.gravity[2]);
    // Mirror EZSoftBone.OnValidate clamps.
    this.iterations = Math.max(1, Math.floor(config.iterations));
    this.deltaTimeMode = config.deltaTimeMode;
    this.constantDeltaTime = Math.max(DELTA_TIME_MIN, config.constantDeltaTime);
    this.maxDeltaTime = Math.max(DELTA_TIME_MIN, config.maxDeltaTime);
    this.maxSubSteps = Math.max(1, Math.floor(config.maxSubSteps));
    this.sleepThreshold = Math.max(0, config.sleepThreshold);
    this.startDepth = Math.max(0, config.startDepth);
    this.siblingMode = config.siblingMode;
    this.siblingRotationConstraints = config.siblingRotationConstraints;
    this.colliders = colliders;

    // InitStructures: CreateBones + SetSiblings + Inflate (lengthUnification is
    // None for v1 packs, so SetTreeLength unification is omitted).
    for (let i = 0; i < chainRoots.length; i++) {
      this.structures.push(buildNode(chainRoots[i], null, this.startDepth, 0, 0, 0));
      this.structureParentWorld.push(new Matrix4());
      this.structureParentRotation.push(new Quaternion());
    }
    this.setSiblings(config.closedSiblings);

    // RefreshRadius + Inflate(material): static config, so evaluated once.
    // globalRadius = lossyScale.Abs().Max() * radius; v1 radius curve is a
    // constant 1 (seam: thread a radiusCurve through here when packs carry one).
    const globalRadius = composeWorldMatrix(host, _m4a).getMaxScaleOnAxis() * Math.max(0, config.radius);
    const mat = config.material;
    for (let i = 0; i < this.structures.length; i++) {
      this.inflateNode(this.structures[i], globalRadius, mat);
    }
    // OnEnable -> SetRestState: buildNode already seeded worldPosition/speed.
  }

  /**
   * Advances one rendered frame: revert stale sim locals, snapshot the
   * animated pose, run the Verlet steps, write rotations/positions back.
   * Call after the AnimationMixer update (EZSoftBone's LateUpdate slot).
   */
  update(dt: number): void {
    if (this.frozen) return;
    for (let i = 0; i < this.structures.length; i++) this.revertNode(this.structures[i]);
    this.snapshot();
    if (this.deltaTimeMode === 'constant') {
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= this.constantDeltaTime && steps < this.maxSubSteps) {
        this.step(this.constantDeltaTime);
        this.accumulator -= this.constantDeltaTime;
        steps++;
      }
      // Drop backlog beyond the cap so a long stall cannot spiral.
      if (this.accumulator > this.constantDeltaTime) this.accumulator = this.constantDeltaTime;
    } else {
      this.step(Math.min(dt, this.maxDeltaTime));
    }
    // UpdateTransforms runs even on zero-step frames: the rotation deltas
    // re-apply the sim state onto the current animated pose.
    this.writeTransforms();
  }

  /**
   * Frozen mirrors a disabled EZSoftBone: OnDisable -> RevertTransforms (sim
   * bones pinned at rest locals, so they ride the animated skeleton rigidly)
   * and OnEnable -> SetRestState (re-seed sim from the current world pose, so
   * unfreezing never snaps).
   */
  setFrozen(frozen: boolean): void {
    if (frozen === this.frozen) return;
    this.frozen = frozen;
    if (frozen) {
      for (let i = 0; i < this.structures.length; i++) this.revertToRest(this.structures[i]);
    } else {
      this.snapshot();
      for (let i = 0; i < this.structures.length; i++) this.seedNode(this.structures[i]);
      this.accumulator = 0;
    }
  }

  // --- structure setup -------------------------------------------------------

  /** EZSoftBone.SetSiblings. */
  private setSiblings(closed: boolean): void {
    if (this.siblingMode === 'rooted') {
      for (let i = 0; i < this.structures.length; i++) {
        this.setSiblingsByDepth([this.structures[i]], closed);
      }
    } else if (this.siblingMode === 'unified') {
      if (this.structures.length > 0) this.setSiblingsByDepth(this.structures.slice(), closed);
    }
  }

  /** EZSoftBone.SetSiblingsByDepth: BFS tiers, linking same-depth neighbors. */
  private setSiblingsByDepth(queue: SoftBoneNode[], closed: boolean): void {
    let head = 0;
    let first = queue[head++];
    for (let i = 0; i < first.childNodes.length; i++) queue.push(first.childNodes[i]);
    let left = first;
    let right: SoftBoneNode | null = null;
    while (head < queue.length) {
      right = queue[head++];
      for (let i = 0; i < right.childNodes.length; i++) queue.push(right.childNodes[i]);
      if (left.depth === right.depth) {
        left.setRightSibling(right);
        right.setLeftSibling(left);
      } else {
        if (closed) {
          left.setRightSibling(first);
          first.setLeftSibling(left);
        }
        first = right;
      }
      left = right;
    }
    if (right !== null && closed) {
      first.setLeftSibling(right);
      right.setRightSibling(first);
    }
  }

  /** Bone.Inflate(baseRadius, radiusCurve, material), precomputed once. */
  private inflateNode(node: SoftBoneNode, globalRadius: number, mat: SoftBoneMaterialParams): void {
    const t = node.normalizedLength;
    node.radius = globalRadius; // radiusCurve is constant 1 in v1 exports
    node.damping = clamp01(mat.damping) * evaluateCurve(mat.dampingCurve, t);
    node.stiffness = clamp01(mat.stiffness) * evaluateCurve(mat.stiffnessCurve, t);
    node.resistance = clamp01(mat.resistance) * evaluateCurve(mat.resistanceCurve, t);
    node.slackness = clamp01(mat.slackness) * evaluateCurve(mat.slacknessCurve, t);
    for (let i = 0; i < node.childNodes.length; i++) {
      this.inflateNode(node.childNodes[i], globalRadius, mat);
    }
  }

  // --- per-frame passes --------------------------------------------------------

  /**
   * Unity Update() -> RevertTransforms, adapted to mixer-after ordering: only
   * locals that still hold exactly our last write are reverted; anything the
   * mixer rewrote this frame IS the animated pose and is kept.
   */
  private revertNode(node: SoftBoneNode): void {
    if (node.depth > this.startDepth) {
      const obj = node.object;
      if (node.hasWrittenRotation && obj.quaternion.equals(node.lastWrittenRotation)) {
        obj.quaternion.copy(node.restLocalRotation);
      }
      if (node.hasWrittenPosition && obj.position.equals(node.lastWrittenPosition)) {
        obj.position.copy(node.restLocalPosition);
      }
    }
    for (let i = 0; i < node.childNodes.length; i++) this.revertNode(node.childNodes[i]);
  }

  /** Bone.RevertTransforms: unconditional rest-local restore (freeze path). */
  private revertToRest(node: SoftBoneNode): void {
    if (node.depth > this.startDepth) {
      node.object.quaternion.copy(node.restLocalRotation);
      node.object.position.copy(node.restLocalPosition);
      node.hasWrittenRotation = false;
      node.hasWrittenPosition = false;
    }
    for (let i = 0; i < node.childNodes.length; i++) this.revertToRest(node.childNodes[i]);
  }

  /** Bone.SetRestState: seed sim state from the current (snapshotted) pose. */
  private seedNode(node: SoftBoneNode): void {
    node.worldPosition.copy(node.animWorldPosition);
    node.speed.set(0, 0, 0);
    node.hasWrittenRotation = false;
    node.hasWrittenPosition = false;
    for (let i = 0; i < node.childNodes.length; i++) this.seedNode(node.childNodes[i]);
  }

  /** Snapshot the animated pose (Unity reads live transforms; we cache once per frame). */
  private snapshot(): void {
    for (let i = 0; i < this.structures.length; i++) {
      const root = this.structures[i];
      const parent = root.object.parent;
      if (parent !== null) {
        composeWorldMatrix(parent, this.structureParentWorld[i]);
        composeWorldRotation(parent, this.structureParentRotation[i]);
      } else {
        this.structureParentWorld[i].identity();
        this.structureParentRotation[i].identity();
      }
      this.snapshotNode(root, this.structureParentWorld[i]);
    }
  }

  private snapshotNode(node: SoftBoneNode, parentWorld: Matrix4): void {
    const obj = node.object;
    _m4a.compose(obj.position, obj.quaternion, obj.scale);
    node.animWorldMatrix.multiplyMatrices(parentWorld, _m4a);
    node.animWorldPosition.setFromMatrixPosition(node.animWorldMatrix);
    for (let i = 0; i < node.childNodes.length; i++) {
      this.snapshotNode(node.childNodes[i], node.animWorldMatrix);
    }
  }

  /** EZSoftBone.UpdateStructures (radius/material re-inflate skipped: static config). */
  private step(deltaTime: number): void {
    if (deltaTime <= DELTA_TIME_MIN) return;
    const subDt = deltaTime / this.iterations;
    for (let i = 0; i < this.iterations; i++) {
      for (let j = 0; j < this.structures.length; j++) {
        this.updateBones(this.structures[j], subDt);
      }
    }
  }

  /** EZSoftBone.UpdateBones: the Verlet step, world space. */
  private updateBones(node: SoftBoneNode, deltaTime: number): void {
    if (node.depth > this.startDepth) {
      const parent = node.parentNode!; // depth > startDepth >= 0 implies a parent
      _old.copy(node.worldPosition);
      _new.copy(node.worldPosition);

      // Resistance (force resistance). Faithful C# quirk: force feeds speed
      // per-step without a dt factor. Scaled per-axis by the component host's
      // LOCAL scale, as in the C#.
      const hostScale = this.host.scale;
      _force.set(this.gravity.x * hostScale.x, this.gravity.y * hostScale.y, this.gravity.z * hostScale.z);
      node.speed.addScaledVector(_force, (1 - node.resistance) / this.iterations);

      // Damping (inertia attenuation) + sleepThreshold early-out on integration.
      node.speed.multiplyScalar(1 - node.damping);
      if (node.speed.lengthSq() > this.sleepThreshold) {
        _new.addScaledVector(node.speed, deltaTime);
      }

      // Stiffness (shape keeper): pull toward the rest offset under the
      // parent's ANIMATED matrix, displaced by the parent's sim movement.
      _expected.copy(node.restLocalPosition).applyMatrix4(parent.animWorldMatrix);
      _expected.x += parent.worldPosition.x - parent.animWorldPosition.x;
      _expected.y += parent.worldPosition.y - parent.animWorldPosition.y;
      _expected.z += parent.worldPosition.z - parent.animWorldPosition.z;
      _new.lerp(_expected, node.stiffness / this.iterations);

      // Slackness (length keeper); lengths via TransformVector to track scale.
      _dir.copy(_new).sub(parent.worldPosition);
      normalizeSafe(_dir);
      _m3.setFromMatrix4(parent.animWorldMatrix);
      _tmp.copy(node.restLocalPosition).applyMatrix3(_m3);
      _expected.copy(parent.worldPosition).addScaledVector(_dir, _tmp.length());
      let lengthConstraints = 1;
      if (this.siblingMode !== 'none') {
        const left = node.leftNode;
        if (left !== null) {
          _dir.copy(_new).sub(left.worldPosition);
          normalizeSafe(_dir);
          _m3.setFromMatrix4(node.animWorldMatrix);
          _tmp.copy(node.leftPosition).applyMatrix3(_m3);
          _tmp2.copy(left.worldPosition).addScaledVector(_dir, _tmp.length());
          _expected.add(_tmp2);
          lengthConstraints++;
        }
        const right = node.rightNode;
        if (right !== null) {
          _dir.copy(_new).sub(right.worldPosition);
          normalizeSafe(_dir);
          _m3.setFromMatrix4(node.animWorldMatrix);
          _tmp.copy(node.rightPosition).applyMatrix3(_m3);
          _tmp2.copy(right.worldPosition).addScaledVector(_dir, _tmp.length());
          _expected.add(_tmp2);
          lengthConstraints++;
        }
      }
      if (lengthConstraints > 1) _expected.multiplyScalar(1 / lengthConstraints);
      // newWorldPosition = Lerp(expected, new, slackness / iterations)
      _new.sub(_expected).multiplyScalar(node.slackness / this.iterations).add(_expected);

      // Collision seam (C#: EnabledColliders + extraColliders when radius > 0).
      if (node.radius > 0) {
        for (let i = 0; i < this.colliders.length; i++) {
          this.colliders[i].collide(_new, node.radius);
        }
      }

      // speed = (speed + (new - old) / dt) * 0.5
      _tmp.copy(_new).sub(_old).multiplyScalar(1 / deltaTime);
      node.speed.add(_tmp).multiplyScalar(0.5);
      node.worldPosition.copy(_new);
    } else {
      node.worldPosition.copy(node.animWorldPosition);
    }

    for (let i = 0; i < node.childNodes.length; i++) {
      this.updateBones(node.childNodes[i], deltaTime);
    }
  }

  /** EZSoftBone.UpdateTransforms. */
  private writeTransforms(): void {
    for (let i = 0; i < this.structures.length; i++) {
      this.writeNode(this.structures[i], this.structureParentWorld[i], this.structureParentRotation[i]);
    }
  }

  /**
   * Bone.UpdateTransform: aim each single-child bone at its simulated child,
   * apply sibling rotation constraints, then move the transform to the
   * simulated position. Writes cascade: children compose against the parent's
   * just-updated world, exactly as live Unity transforms would.
   */
  private writeNode(node: SoftBoneNode, parentWorld: Matrix4, parentRotation: Quaternion): void {
    const obj = node.object;
    _m4a.compose(obj.position, obj.quaternion, obj.scale);
    node.updatedWorldMatrix.multiplyMatrices(parentWorld, _m4a);
    node.updatedWorldRotation.multiplyQuaternions(parentRotation, obj.quaternion);

    if (node.depth > this.startDepth) {
      if (node.childNodes.length === 1) {
        const child = node.childNodes[0];
        // rotation *= FromToRotation(child.localPosition,
        //                            InverseTransformVector(child.world - world))
        _va.copy(child.worldPosition).sub(node.worldPosition);
        _m3.setFromMatrix4(node.updatedWorldMatrix).invert();
        _va.applyMatrix3(_m3);
        fromToRotation(child.restLocalPosition, _va, _qa);
        this.applyWorldRotation(node, parentWorld, parentRotation, _qa);

        if (this.siblingRotationConstraints) {
          const left = node.leftNode;
          const right = node.rightNode;
          if (left !== null && right !== null) {
            // C# evaluates both sibling deltas against the matrix updated by
            // the aim rotation above, then applies Quaternion.Lerp(l, r, 0.5).
            this.siblingDelta(node, left, node.leftPosition, _qa);
            this.siblingDelta(node, right, node.rightPosition, _qb);
            nlerpQuaternions(_qa, _qb, 0.5, _qc);
            this.applyWorldRotation(node, parentWorld, parentRotation, _qc);
          } else if (left !== null) {
            this.siblingDelta(node, left, node.leftPosition, _qa);
            this.applyWorldRotation(node, parentWorld, parentRotation, _qa);
          } else if (right !== null) {
            this.siblingDelta(node, right, node.rightPosition, _qa);
            this.applyWorldRotation(node, parentWorld, parentRotation, _qa);
          }
        }
        node.lastWrittenRotation.copy(obj.quaternion);
        node.hasWrittenRotation = true;
      }

      // transform.position = worldPosition
      _m4b.copy(parentWorld).invert();
      obj.position.copy(node.worldPosition).applyMatrix4(_m4b);
      _m4a.compose(obj.position, obj.quaternion, obj.scale);
      node.updatedWorldMatrix.multiplyMatrices(parentWorld, _m4a);
      node.lastWrittenPosition.copy(obj.position);
      node.hasWrittenPosition = true;
    }

    for (let i = 0; i < node.childNodes.length; i++) {
      this.writeNode(node.childNodes[i], node.updatedWorldMatrix, node.updatedWorldRotation);
    }
  }

  /** Unity `transform.rotation *= delta` incl. the immediate world-matrix refresh. */
  private applyWorldRotation(
    node: SoftBoneNode,
    parentWorld: Matrix4,
    parentRotation: Quaternion,
    delta: Quaternion,
  ): void {
    const obj = node.object;
    node.updatedWorldRotation.multiply(delta);
    _qd.copy(parentRotation).invert();
    obj.quaternion.copy(node.updatedWorldRotation).premultiply(_qd); // local = parentRot^-1 * world
    _m4a.compose(obj.position, obj.quaternion, obj.scale);
    node.updatedWorldMatrix.multiplyMatrices(parentWorld, _m4a);
  }

  /** One sibling term of the rotation constraint (uses the CURRENT updated matrix). */
  private siblingDelta(node: SoftBoneNode, sibling: SoftBoneNode, restOffset: Vector3, out: Quaternion): void {
    _va.copy(sibling.worldPosition).sub(node.worldPosition);
    _m3.setFromMatrix4(node.updatedWorldMatrix).invert();
    _va.applyMatrix3(_m3);
    fromToRotation(restOffset, _va, out);
  }
}
