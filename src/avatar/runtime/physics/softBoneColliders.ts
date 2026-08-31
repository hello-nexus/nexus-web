/**
 * Capsule collider port for the EZSoftBone solver, faithful to
 * EZSoftBoneUtility.GetCapsuleParams + PointOutsideCapsule (a sphere is the
 * degenerate height <= 2*radius case, which the same math handles).
 *
 * The Unity ground truth (MainScene's EZSoftBone instance) collides hair
 * against CapsuleCollider components parented to body bones; this port bakes
 * each capsule's transform into springbones.json as an attachment node path
 * plus Unity CapsuleCollider fields (center/direction/radius/height) in the
 * node's local space.
 *
 * updateWorld() runs once per rendered frame BEFORE the solver steps (the
 * capsule bones are humanoid, already posed by the mixer); collide() then
 * costs one segment-distance test per node per step. Zero allocations on
 * either path, matching the solver's update-path discipline.
 */

import { Matrix4, Vector3 } from 'three';
import type { Object3D } from 'three';
import type { SoftBoneCollider } from './softBoneCore';

/** Unity CapsuleCollider.direction: 0 = X, 1 = Y, 2 = Z (local axis). */
export type CapsuleDirection = 0 | 1 | 2;

const _m4 = new Matrix4();
const _cwLocal = new Matrix4();

/**
 * Same lazy-safe world-matrix walk as softBoneCore's composeWorldMatrix
 * (duplicated so this file's only softBoneCore import is type-only, keeping
 * it loadable under plain node for scripts/springBones.test.ts).
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
const _scale = new Vector3();
const _c0 = new Vector3();
const _c1 = new Vector3();
const _capsuleDir = new Vector3();
const _pointDir = new Vector3();
const _bounce = new Vector3();

/** PointOutsideSphere(ref position, spherePosition, radius). */
function pointOutsideSphere(position: Vector3, center: Vector3, radius: number): void {
  _bounce.copy(position).sub(center);
  const len = _bounce.length();
  if (len < radius) {
    // Unity's Vector3.normalized on a near-zero vector is zero: the point
    // stays put instead of going NaN, same as the C#.
    position.copy(center).addScaledVector(_bounce, len > 1e-5 ? radius / len : 0);
  }
}

export class CapsuleSoftBoneCollider implements SoftBoneCollider {
  private readonly attach: Object3D;
  private readonly center = new Vector3();
  private readonly direction: CapsuleDirection;
  private readonly radius: number;
  private readonly height: number;

  /** World-space state, refreshed by updateWorld(). */
  private readonly worldCenter0 = new Vector3();
  private readonly worldCenter1 = new Vector3();
  private worldRadius = 0;

  constructor(attach: Object3D, center: readonly [number, number, number], direction: CapsuleDirection, radius: number, height: number) {
    this.attach = attach;
    this.center.set(center[0], center[1], center[2]);
    this.direction = direction;
    this.radius = radius;
    this.height = height;
  }

  /**
   * EZSoftBoneUtility.GetCapsuleParams: derive the world end-cap centers and
   * radius from the attachment's CURRENT world matrix (mixer-fresh, same walk
   * the solver snapshot uses).
   */
  updateWorld(): void {
    composeWorldMatrix(this.attach, _m4);
    _scale.setFromMatrixScale(_m4);
    _scale.set(Math.abs(_scale.x), Math.abs(_scale.y), Math.abs(_scale.z));
    let radius = this.radius;
    let half = this.height * 0.5;
    _c0.copy(this.center);
    _c1.copy(this.center);
    switch (this.direction) {
      case 0:
        radius *= Math.max(_scale.y, _scale.z);
        half = Math.max(0, half - radius / _scale.x);
        _c0.x -= half;
        _c1.x += half;
        break;
      case 1:
        radius *= Math.max(_scale.x, _scale.z);
        half = Math.max(0, half - radius / _scale.y);
        _c0.y -= half;
        _c1.y += half;
        break;
      case 2:
        radius *= Math.max(_scale.x, _scale.y);
        half = Math.max(0, half - radius / _scale.z);
        _c0.z -= half;
        _c1.z += half;
        break;
    }
    this.worldCenter0.copy(_c0).applyMatrix4(_m4);
    this.worldCenter1.copy(_c1).applyMatrix4(_m4);
    this.worldRadius = radius;
  }

  /**
   * EZSoftBoneUtility.PointOutsideCapsule with spacing = the sim node's
   * radius: pushes `position` out to the capsule surface expanded by it.
   */
  collide(position: Vector3, nodeRadius: number): void {
    const radius = this.worldRadius + nodeRadius;
    _capsuleDir.copy(this.worldCenter1).sub(this.worldCenter0);
    _pointDir.copy(position).sub(this.worldCenter0);
    const dot = _capsuleDir.dot(_pointDir);
    if (dot <= 0) {
      pointOutsideSphere(position, this.worldCenter0, radius);
    } else if (dot >= _capsuleDir.lengthSq()) {
      pointOutsideSphere(position, this.worldCenter1, radius);
    } else {
      // bounceDir = pointDir - Project(pointDir, capsuleDir)
      _bounce.copy(_pointDir).addScaledVector(_capsuleDir, -dot / _capsuleDir.lengthSq());
      const dist = _bounce.length();
      const push = radius - dist;
      if (push > 0 && dist > 1e-5) {
        position.addScaledVector(_bounce, push / dist);
      }
    }
  }
}
