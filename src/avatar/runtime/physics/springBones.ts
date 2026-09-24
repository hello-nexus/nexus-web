/**
 * Spring bone (EZSoftBone) runtime binding.
 * Resolves springbones.json components against the loaded GLB hierarchy and
 * drives the ported solver (softBoneCore.ts) in world space.
 *
 * Call order contract: update(dt) runs AFTER the AnimationMixer has written
 * this frame's bone locals (AvatarRuntime.update does mixer first), mirroring
 * EZSoftBone's LateUpdate-after-Animator ordering.
 */

import type * as THREE from 'three';
import type { AvatarPack } from '../../pack/loadPack';
import type { SpringBoneColliderEntry, SpringBoneComponent } from '../../pack/types';
import { CapsuleSoftBoneCollider, PlaneSoftBoneCollider } from './softBoneColliders';
import {
  SoftBoneSystem,
  type DeltaTimeMode,
  type SiblingMode,
  type SoftBoneCollider,
  type SoftBoneSystemConfig,
} from './softBoneCore';

export interface SpringBones {
  update(dt: number): void;
  /** Frozen bones hold their pose (used while off-screen / paused). */
  setFrozen(frozen: boolean): void;
}

/**
 * The Unity reference build stepped EZSoftBone once per ~60Hz rendered frame
 * (DeltaTimeMode.DeltaTime). The solver's response is per-STEP (stiffness,
 * damping, and the gravity feed apply once per step, not per second), so the
 * only way to look the same on a 30fps panel and a 144Hz monitor is to step
 * at Unity's cadence on a fixed accumulator.
 */
const UNITY_STEP_SECONDS = 1 / 60;

export interface SpringBonesOptions {
  /**
   * Default: fixed-timestep accumulator at the Unity reference cadence
   * (UNITY_STEP_SECONDS), frame-rate independent. 'variable': step once per
   * frame with the real dt (EZSoftBone DeltaTimeMode.DeltaTime - display-rate
   * dependent). 'constant': accumulator on the component's constantDeltaTime.
   */
  deltaTimeMode?: DeltaTimeMode;
  /** Clamp for 'variable' mode; default 1/20 s. */
  maxDeltaTime?: number;
  /** Catch-up cap per frame for accumulator modes; default 4. */
  maxSubSteps?: number;
  /**
   * Sibling LINK topology (EZSoftBone UnificationMode m_SiblingConstraints, not
   * captured by the exporter). Default 'none', matching the reference prefab -
   * which leaves the exported siblingRotationConstraints flag inert, as in
   * Unity, where that flag only gates rotation math on links Unification built.
   */
  siblingMode?: SiblingMode;
  closedSiblings?: boolean;
  /** Extra colliders appended after the ones built from springbones.json. */
  colliders?: SoftBoneCollider[];
}

// --- node path resolution ----------------------------------------------------

const RESERVED_RE = /[[\].:/]/g;

/**
 * Mirror of THREE.PropertyBinding.sanitizeNodeName, which GLTFLoader applies
 * to every node name (Unity's "Hair.l" loads as "Hairl").
 */
function sanitizeNodeName(name: string): string {
  return name.replace(/\s/g, '_').replace(RESERVED_RE, '');
}

function findDescendantByName(root: THREE.Object3D, raw: string, sanitized: string): THREE.Object3D | null {
  if (root.name === raw || root.name === sanitized) return root;
  for (const child of root.children) {
    const hit = findDescendantByName(child, raw, sanitized);
    if (hit !== null) return hit;
  }
  return null;
}

function directChildByName(parent: THREE.Object3D, segment: string): THREE.Object3D | null {
  const sanitized = sanitizeNodeName(segment);
  for (const child of parent.children) {
    if (child.name === segment || child.name === sanitized) return child;
  }
  return null;
}

/**
 * Resolves a '/'-joined Unity transform path (pack convention: relative to the
 * pack root node, segments matching GLB node names). The first segment is
 * found by deep search because the loader may nest the pack root under extra
 * groups; the remaining segments must be direct children, like Unity's
 * Transform.Find walk.
 */
function resolveNodePath(root: THREE.Object3D, path: string): THREE.Object3D | null {
  const segments = path.split('/');
  let node: THREE.Object3D | null = findDescendantByName(root, segments[0], sanitizeNodeName(segments[0]));
  for (let i = 1; node !== null && i < segments.length; i++) {
    node = directChildByName(node, segments[i]);
  }
  return node;
}

// --- factory -------------------------------------------------------------------

type BoneCollider = CapsuleSoftBoneCollider | PlaneSoftBoneCollider;

/** Builds the component's body colliders (Unity extraColliders equivalent). */
function createColliders(
  entries: readonly SpringBoneColliderEntry[],
  skeletonRoot: THREE.Object3D,
): BoneCollider[] {
  const out: BoneCollider[] = [];
  for (const entry of entries) {
    const attach = resolveNodePath(skeletonRoot, entry.nodePath);
    if (attach === null) {
      console.warn(`[springBones] collider attachment "${entry.nodePath}" not found; collider skipped`);
      continue;
    }
    switch (entry.shape) {
      case 'capsule':
        out.push(new CapsuleSoftBoneCollider(attach, entry.center, entry.direction, entry.radius, entry.height));
        break;
      case 'plane':
        out.push(new PlaneSoftBoneCollider(attach, entry.center, entry.normal));
        break;
      default:
        console.warn(`[springBones] unsupported collider shape "${String((entry as { shape: unknown }).shape)}" skipped`);
    }
  }
  return out;
}

function createSystem(
  component: SpringBoneComponent,
  skeletonRoot: THREE.Object3D,
  options: SpringBonesOptions,
  colliders: readonly SoftBoneCollider[],
): SoftBoneSystem | null {
  const chainRoots: THREE.Object3D[] = [];
  for (const chain of component.chains) {
    const node = resolveNodePath(skeletonRoot, chain.rootPath);
    if (node !== null) {
      chainRoots.push(node);
    } else {
      console.warn(`[springBones] chain root "${chain.rootPath}" not found under "${skeletonRoot.name}"; chain skipped`);
    }
  }
  if (chainRoots.length === 0) {
    console.warn(`[springBones] component "${component.nodePath}" resolved no chains; skipped`);
    return null;
  }

  const host = resolveNodePath(skeletonRoot, component.nodePath);
  if (host === null) {
    console.warn(`[springBones] component host "${component.nodePath}" not found; using skeleton root`);
  }

  // Explicit 'constant' honors the component's exported constantDeltaTime;
  // the default accumulator steps at the Unity reference frame rate instead
  // (see UNITY_STEP_SECONDS - the exported 0.03 belongs to Unity's unused
  // Constant mode, not to the DeltaTime mode the reference actually ran).
  const deltaTimeMode = options.deltaTimeMode ?? 'constant';
  const constantDeltaTime = options.deltaTimeMode === undefined ? UNITY_STEP_SECONDS : component.constantDeltaTime;

  const config: SoftBoneSystemConfig = {
    // The exporter mirrors X for the Unity -> glTF handedness conversion, so
    // Unity world-space direction vectors flip X too.
    gravity: [-component.gravity[0], component.gravity[1], component.gravity[2]],
    iterations: component.iterations,
    deltaTimeMode,
    constantDeltaTime,
    maxDeltaTime: options.maxDeltaTime ?? 1 / 20,
    maxSubSteps: options.maxSubSteps ?? 4,
    sleepThreshold: component.sleepThreshold,
    startDepth: component.startDepth ?? 0,
    siblingMode: options.siblingMode ?? 'none',
    closedSiblings: options.closedSiblings ?? false,
    siblingRotationConstraints: component.siblingRotationConstraints,
    radius: component.radius ?? 0,
    material: {
      damping: component.material.damping,
      dampingCurve: component.material.curves.damping,
      stiffness: component.material.stiffness,
      stiffnessCurve: component.material.curves.stiffness,
      resistance: component.material.resistance,
      resistanceCurve: component.material.curves.resistance,
      slackness: component.material.slackness,
      slacknessCurve: component.material.curves.slackness,
    },
  };
  return new SoftBoneSystem(host ?? skeletonRoot, chainRoots, config, colliders);
}

export function createSpringBones(
  pack: AvatarPack,
  skeletonRoot: THREE.Object3D,
  options: SpringBonesOptions = {},
): SpringBones {
  const systems: SoftBoneSystem[] = [];
  const colliders: BoneCollider[] = [];
  for (const component of pack.springbones?.components ?? []) {
    const own = createColliders(component.colliders ?? [], skeletonRoot);
    const system = createSystem(component, skeletonRoot, options, [...own, ...(options.colliders ?? [])]);
    if (system !== null) {
      systems.push(system);
      colliders.push(...own);
    }
  }
  return {
    update(dt: number): void {
      // Colliders follow mixer-posed humanoid bones; refresh before stepping,
      // as Unity's colliders read live transforms during LateUpdate.
      for (let i = 0; i < colliders.length; i++) colliders[i].updateWorld();
      for (let i = 0; i < systems.length; i++) systems[i].update(dt);
    },
    setFrozen(frozen: boolean): void {
      for (let i = 0; i < systems.length; i++) systems[i].setFrozen(frozen);
    },
  };
}
