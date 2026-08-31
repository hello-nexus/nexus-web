/**
 * TypeScript mirror of docs/pack-format.md (Avatar Pack Format v1).
 * That doc is the contract with the pack exporter; keep this file in
 * lockstep with it.
 *
 * Conventions (from the doc):
 * - Node paths are '/'-joined Unity transform paths relative to the exported
 *   root, matching GLB node names exactly.
 * - Colors are linear-space [r, g, b, a] floats.
 * - Every JSON file carries formatVersion: 1.
 */

export type Vec3 = [number, number, number];
/** Linear-space color, as Unity serializes it. */
export type Color4 = [number, number, number, number];
/** [t, value] pair sampled from a Unity AnimationCurve (t normalized 0..1). */
export type CurvePoint = [number, number];

// ---------------------------------------------------------------------------
// pack.json

export interface PackFiles {
  model: string;
  /** Static environment GLB (the baked stage); absent for character-only packs. */
  environment?: string;
  /** Equirect sky panorama (scene.background); absent = flat color/none. */
  sky?: string;
  /* Sidecars are typed optional so a partial pack loads during bring-up;
     a full export lists all of them. */
  materials?: string;
  springbones?: string;
  scene?: string;
  states?: string;
  scripts?: string;
}

export interface PackIndex {
  formatVersion: 1;
  id: string;
  name: string;
  unityVersion: string;
  exporterVersion: string;
  exportedAt: string;
  files: PackFiles;
  /** sha256 hex per file (every file except pack.json itself). */
  hashes: Record<string, string>;
}

// ---------------------------------------------------------------------------
// materials.json

export type AlphaMode = 'opaque' | 'cutout' | 'blend' | 'premultiplied';

export interface MaterialParams {
  baseColor: Color4;
  shadowColor: Color4;
  shadowColorFromLight: boolean;
  rampType: string;
  rampThreshold: number;
  rampSmoothing: number;
  useFresnelReflections: boolean;
  fresnelMin: number;
  fresnelMax: number;
  receiveShadows: boolean;
  castShadows: boolean;
  alphaMode: AlphaMode;
  cutoff: number;
  dissolveValue: number;
  doubleSided: boolean;
}

/** Full material dump for forward compatibility; ignore unknown keys. */
export interface MaterialRaw {
  floats: Record<string, number>;
  colors: Record<string, Color4>;
  textureNames: Record<string, string>;
}

export interface MaterialEntry {
  name: string;
  shader: string;
  renderQueue: number;
  params: MaterialParams;
  /** null = map is embedded in the GLB and bound to this material there. */
  textures: Record<string, string | null>;
  keywords: string[];
  raw: MaterialRaw;
}

export interface MaterialsFile {
  formatVersion: 1;
  materials: MaterialEntry[];
}

// ---------------------------------------------------------------------------
// springbones.json (EZSoftBone component data)

export interface SpringBoneCurves {
  damping: CurvePoint[];
  stiffness: CurvePoint[];
  resistance: CurvePoint[];
  slackness: CurvePoint[];
}

export interface SpringBoneMaterial {
  damping: number;
  stiffness: number;
  resistance: number;
  slackness: number;
  curves: SpringBoneCurves;
}

export interface SpringBoneChain {
  rootPath: string;
}

/**
 * Body collider the component's sim nodes push out of. Unity CapsuleCollider
 * fields in the attachment node's local space (a sphere is a capsule with
 * height <= 2*radius); dimensions in the node's local units.
 */
export interface SpringBoneColliderEntry {
  shape: 'capsule';
  /** '/'-joined node path of the bone the capsule follows. */
  nodePath: string;
  center: Vec3;
  /** Local axis the capsule height runs along: 0 = X, 1 = Y, 2 = Z. */
  direction: 0 | 1 | 2;
  radius: number;
  height: number;
}

export interface SpringBoneComponent {
  nodePath: string;
  gravity: Vec3;
  iterations: number;
  constantDeltaTime: number;
  sleepThreshold: number;
  siblingRotationConstraints: boolean;
  /** EZSoftBone m_StartDepth: chain depths <= this anchor instead of simulating. */
  startDepth?: number;
  /** EZSoftBone m_Radius: per-node collision radius (0 disables collision). */
  radius?: number;
  material: SpringBoneMaterial;
  chains: SpringBoneChain[];
  colliders: SpringBoneColliderEntry[];
}

export interface SpringBonesFile {
  formatVersion: 1;
  components: SpringBoneComponent[];
}

// ---------------------------------------------------------------------------
// scene.json

export interface SceneLight {
  /** "directional" in v1; unknown types must be skipped, not fatal. */
  type: string;
  color: Color4;
  intensity: number;
  /** Unity euler degrees; the light points along the rotated Unity +Z. */
  rotationEuler: Vec3;
  shadows: 'hard' | 'soft' | 'none';
  shadowStrength: number;
}

export interface SceneAmbient {
  mode: string;
  sky: Color4;
  equator: Color4;
  ground: Color4;
}

export interface SceneBackground {
  type: string;
  color: Color4;
}

export interface SceneCamera {
  fov: number;
  near: number;
  far: number;
  position: Vec3;
  rotationEuler: Vec3;
}

export interface SceneOutline {
  useDepth: boolean;
  useNormals: boolean;
  depthThresholdMin: number;
  depthThresholdMax: number;
  colorThreshold: number;
  /** Full OutlinePostProcessingMat property dump; tune without re-export. */
  raw: Record<string, unknown>;
}

/** World TRS of the character's scene instance (prefab assets carry no placement). */
export interface SceneCharacterRoot {
  position: Vec3;
  rotationEuler: Vec3;
  scale: Vec3;
}

export interface SceneFile {
  formatVersion: 1;
  colorSpace: string;
  toneMapping: string;
  lights: SceneLight[];
  ambient: SceneAmbient;
  background: SceneBackground;
  fog: unknown | null;
  camera: SceneCamera;
  characterRoot?: SceneCharacterRoot;
  /** World TRS of the environment (stage) scene instance; pairs with files.environment. */
  environment?: SceneCharacterRoot;
  outline: SceneOutline;
}

// ---------------------------------------------------------------------------
// states.json (AnimatorController dump)

export type AnimParameterType = 'bool' | 'trigger' | 'float' | 'int';

export interface AnimParameter {
  name: string;
  type: AnimParameterType;
  default?: boolean | number;
}

/** Unity AnimatorConditionMode, lowercased. */
export type ConditionMode = 'if' | 'ifnot' | 'greater' | 'less' | 'equals' | 'notequal';

export interface TransitionCondition {
  param: string;
  mode: ConditionMode;
  threshold: number;
}

export interface StateTransition {
  to: string;
  hasExitTime: boolean;
  exitTime: number;
  duration: number;
  conditions: TransitionCondition[];
}

export interface AnimState {
  name: string;
  /** Matches a glTF animation name in model.glb. */
  clip: string;
  speed: number;
  loop: boolean;
  transitions: StateTransition[];
}

export interface AnimLayer {
  name: string;
  defaultState: string;
  states: AnimState[];
  anyStateTransitions: StateTransition[];
}

export interface StatesFile {
  formatVersion: 1;
  parameters: AnimParameter[];
  layers: AnimLayer[];
}

// ---------------------------------------------------------------------------
// scripts.json (tiered script-sync inventory)

export interface ScriptSource {
  type: string;
  sourcePath: string;
  sourceHash: string;
}

/**
 * JSON-ified serialized field set: numbers, bools, strings, colors as
 * [r,g,b,a], vectors as arrays, object references as node paths/asset names.
 */
export type ScriptFieldValue = number | boolean | string | number[] | null;

export interface ScriptComponent {
  nodePath: string;
  type: string;
  enabled: boolean;
  fields: Record<string, ScriptFieldValue>;
}

export interface ScriptsFile {
  formatVersion: 1;
  scripts: ScriptSource[];
  components: ScriptComponent[];
}
