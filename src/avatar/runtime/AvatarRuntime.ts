/**
 * Orchestrator: turns a loaded AvatarPack into a live three.js scene.
 * Table-driven off the pack sidecars per docs/pack-format.md; adding a
 * character means adding a pack, not changing this file.
 */

import * as THREE from 'three';
import type { AvatarPack } from '../pack/loadPack';
import type { MaterialEntry, SceneLight, Vec3 } from '../pack/types';
import { AvatarStateMachine } from './anim/stateMachine';
import { eventsBetween, type FxEvent } from './fx/clipEvents';
import { FxLayer } from './fx/fxLayer';
import { createToonMaterial, packColor } from './materials/toonMaterial';
import { createSpringBones, type SpringBones } from './physics/springBones';

const DEG2RAD = Math.PI / 180;


/**
 * Unity euler degrees -> world direction of the rotated Unity +Z (forward).
 * Unity composes euler as intrinsic Y-X-Z; Unity->glTF handedness conversion
 * flips X (UnityGLTF convention), which the exporter also applies to nodes.
 */
function unityEulerToForward(euler: Vec3): THREE.Vector3 {
  const e = new THREE.Euler(euler[0] * DEG2RAD, euler[1] * DEG2RAD, euler[2] * DEG2RAD, 'YXZ');
  const forward = new THREE.Vector3(0, 0, 1).applyEuler(e);
  forward.x = -forward.x;
  return forward;
}

function unityPositionToThree(p: Vec3): THREE.Vector3 {
  return new THREE.Vector3(-p[0], p[1], p[2]);
}

/**
 * Unity euler degrees -> three quaternion under the X-mirror handedness
 * conversion: conjugating a rotation by diag(-1,1,1) negates the y and z
 * quaternion components.
 */
function unityEulerToThreeQuaternion(euler: Vec3): THREE.Quaternion {
  const e = new THREE.Euler(euler[0] * DEG2RAD, euler[1] * DEG2RAD, euler[2] * DEG2RAD, 'YXZ');
  const q = new THREE.Quaternion().setFromEuler(e);
  q.y = -q.y;
  q.z = -q.z;
  return q;
}

export class AvatarRuntime {
  readonly pack: AvatarPack;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly mixer: THREE.AnimationMixer;
  readonly stateMachine: AvatarStateMachine;
  readonly springBones: SpringBones;
  /** Particles scheduled by the playing clip's events. */
  readonly fx: FxLayer;
  private eventGeneration = -1;
  private eventTime = 0;

  private readonly ownedMaterials: THREE.Material[] = [];
  /** Environment atlas textures: exclusively env-owned, disposed with the runtime
      (character textures stay shared with the GLB and are not tracked here). */
  private readonly ownedTextures: THREE.Texture[] = [];

  constructor(pack: AvatarPack, renderer: THREE.WebGLRenderer) {
    this.pack = pack;
    this.renderer = renderer;

    // Linear workflow, sRGB output, no tone mapping (pack contract). Lighting
    // is physically correct by default since three r155 (useLegacyLights was
    // removed in r165); Unity intensities are taken 1:1 for now and revisited
    // against the real pack.
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    const sceneDef = pack.scene;
    if (this.pack.sky) {
      // The pack's equirect panorama (the authored skybox cubemap) wins over
      // the flat scene background color; visible through windows and beyond
      // the stage geometry.
      this.scene.background = this.pack.sky;
      this.ownedTextures.push(this.pack.sky);
    } else if (sceneDef?.background.color) {
      this.scene.background = packColor(sceneDef.background.color);
    }

    // --- lights -----------------------------------------------------------
    const lights: SceneLight[] = sceneDef?.lights ?? [
      // Bring-up fallback when scene.json is absent from a partial pack.
      { type: 'directional', color: [1, 1, 1, 1], intensity: 1, rotationEuler: [50, -30, 0], shadows: 'none', shadowStrength: 1 },
    ];
    let anyShadows = false;
    for (const lightDef of lights) {
      if (lightDef.type !== 'directional') {
        console.warn(`[AvatarRuntime] unsupported light type "${lightDef.type}" skipped`);
        continue;
      }
      const light = new THREE.DirectionalLight(packColor(lightDef.color), lightDef.intensity);
      const forward = unityEulerToForward(lightDef.rotationEuler);
      light.position.copy(forward).multiplyScalar(-10);
      light.target.position.set(0, 0, 0);
      if (lightDef.shadows !== 'none') {
        anyShadows = true;
        light.castShadow = true;
        light.shadow.mapSize.set(1024, 1024);
        const cam = light.shadow.camera;
        cam.left = -2;
        cam.right = 2;
        cam.top = 2.5;
        cam.bottom = -0.5;
        cam.near = 0.1;
        cam.far = 30;
      }
      this.scene.add(light, light.target);
    }
    this.renderer.shadowMap.enabled = anyShadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Unity trilight ambient approximation: a HemisphereLight carries the
    // sky->ground gradient and a subtle AmbientLight adds the equator term.
    // (three has no native three-color ambient; the real TCP2 shader port can
    // evaluate the trilight exactly later.)
    const ambient = sceneDef?.ambient;
    if (ambient) {
      this.scene.add(new THREE.HemisphereLight(packColor(ambient.sky), packColor(ambient.ground), 1));
      this.scene.add(new THREE.AmbientLight(packColor(ambient.equator), 0.35));
    } else {
      this.scene.add(new THREE.HemisphereLight(0x8888aa, 0x333344, 1));
    }

    // --- camera -----------------------------------------------------------
    const size = renderer.getSize(new THREE.Vector2());
    const aspect = size.x / Math.max(size.y, 1);
    const camDef = sceneDef?.camera;
    this.camera = new THREE.PerspectiveCamera(camDef?.fov ?? 50, aspect, camDef?.near ?? 0.1, camDef?.far ?? 100);
    if (camDef) {
      this.camera.position.copy(unityPositionToThree(camDef.position));
      // Unity cameras look along local +Z; aim via the converted forward.
      const forward = unityEulerToForward(camDef.rotationEuler);
      this.camera.lookAt(this.camera.position.clone().add(forward));
    } else {
      this.camera.position.set(0, 1.2, 2.6);
      this.camera.lookAt(0, 1, 0);
    }

    // --- model + materials -------------------------------------------------
    // The character's placement (incl. its face-the-camera Y rotation) comes
    // from the Unity SCENE instance, exported as scene.characterRoot.
    const rootDef = sceneDef?.characterRoot;
    if (rootDef) {
      pack.gltf.scene.position.copy(unityPositionToThree(rootDef.position));
      pack.gltf.scene.quaternion.copy(unityEulerToThreeQuaternion(rootDef.rotationEuler));
      pack.gltf.scene.scale.set(rootDef.scale[0], rootDef.scale[1], rootDef.scale[2]);
    }
    this.scene.add(pack.gltf.scene);
    this.applyMaterials();
    this.addEnvironment();
    this.addCharacterShadow();

    // --- animation + physics -----------------------------------------------
    this.mixer = new THREE.AnimationMixer(pack.gltf.scene);
    this.stateMachine = new AvatarStateMachine(pack.states, this.mixer, pack.gltf.animations);
    this.springBones = createSpringBones(pack, pack.gltf.scene);
    this.fx = new FxLayer(pack.gltf.scene);
  }

  /**
   * Replaces every GLB (PBR) material with the toon factory output, keyed by
   * material name from materials.json. Textures embedded in the GLB stay
   * bound: the lookup lifts them from the original material (.map).
   */
  private applyMaterials(): void {
    const entries = new Map<string, MaterialEntry>();
    for (const m of this.pack.materials?.materials ?? []) entries.set(m.name, m);
    if (entries.size === 0) {
      console.warn('[AvatarRuntime] no materials.json entries; keeping GLB materials');
      return;
    }

    this.pack.gltf.scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      // three culls skinned meshes by their BIND-POSE bounding sphere; the
      // animated pose moves far outside it (halo/hair primitives have cm-scale
      // spheres at the rig origin), so close-up cameras cull visible parts.
      if ((obj as THREE.SkinnedMesh).isSkinnedMesh) obj.frustumCulled = false;
      const replaceOne = (orig: THREE.Material): THREE.Material => {
        const entry = entries.get(orig.name);
        if (!entry) {
          console.warn(`[AvatarRuntime] material "${orig.name}" missing from materials.json; keeping GLB material`);
          return orig;
        }
        const lookup = (name: string): THREE.Texture | null => {
          // v1 keeps every map embedded in the GLB bound to the original
          // material; "main" is its baseColorTexture (.map).
          if (name === 'main') return (orig as THREE.MeshStandardMaterial).map ?? null;
          return null;
        };
        const mat = createToonMaterial(entry, lookup);
        // Keep the authored identity: addCharacterShadow uses the name to
        // tell authored-castShadows meshes from unmatched defaults.
        mat.name = entry.name;
        this.ownedMaterials.push(mat);
        obj.castShadow = entry.params.castShadows;
        obj.receiveShadow = entry.params.receiveShadows;
        // Textures are shared objects and survive material disposal.
        orig.dispose();
        return mat;
      };
      obj.material = Array.isArray(obj.material) ? obj.material.map(replaceOne) : replaceOne(obj.material);
    });
  }

  /**
   * Adds the baked stage (files.environment) as static unlit meshes: the
   * atlas already carries the final colors, so every GLB material is replaced
   * with a MeshBasicMaterial (no light response, no shadows). Placement comes
   * from the Unity scene instance (scene.environment), converted with the
   * same X-flip handedness as characterRoot. Drawn before the character via
   * renderOrder; static bounds make default frustum culling correct.
   */
  private addEnvironment(): void {
    const env = this.pack.environment;
    if (!env) return;
    const placement = this.pack.scene?.environment;
    if (placement) {
      env.scene.position.copy(unityPositionToThree(placement.position));
      env.scene.quaternion.copy(unityEulerToThreeQuaternion(placement.rotationEuler));
      env.scene.scale.set(placement.scale[0], placement.scale[1], placement.scale[2]);
    }
    env.scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const replaceOne = (orig: THREE.Material): THREE.Material => {
        const std = orig as THREE.MeshStandardMaterial;
        const mat = new THREE.MeshBasicMaterial({
          map: std.map ?? null,
          color: std.color?.clone() ?? new THREE.Color(1, 1, 1),
          alphaTest: std.alphaTest > 0 ? std.alphaTest : 0,
          side: std.side,
          // The pack's glass primitive (alphaMode BLEND) must keep its
          // translucency; depthWrite off so panes don't z-kill the room
          // behind them regardless of draw order.
          transparent: std.transparent,
          opacity: std.opacity,
          depthWrite: !std.transparent,
        });
        if (std.map) {
          // The stage atlas packs islands with zero margin (export_stage.py),
          // so GPU mip levels average neighboring islands into pixel noise on
          // small props (bench: monitor screens at widget-tile minification).
          std.map.generateMipmaps = false;
          std.map.minFilter = THREE.LinearFilter;
          std.map.needsUpdate = true;
          if (!this.ownedTextures.includes(std.map)) this.ownedTextures.push(std.map);
        }
        this.ownedMaterials.push(mat);
        orig.dispose();
        return mat;
      };
      obj.material = Array.isArray(obj.material) ? obj.material.map(replaceOne) : replaceOne(obj.material);
      obj.castShadow = false;
      obj.receiveShadow = false;
      obj.renderOrder = -1;
    });
    this.scene.add(env.scene);
  }

  /** Advances animation and physics. The harness owns camera controls. */
  update(dt: number): void {
    this.mixer.update(dt);
    this.stateMachine.update(dt);
    this.springBones.update(dt);
    this.fireClipEvents();
    this.fx.update(dt);
  }

  /** Spawns the active clip's events whose time the action crossed this frame. */
  private fireClipEvents(): void {
    const action = this.stateMachine.activeAction;
    if (!action) return;
    const now = action.time;
    // A new generation is a fresh start (even of the same, rewound action),
    // not a loop wrap, so no tail events fire.
    const generation = this.stateMachine.actionGeneration;
    const prev = generation === this.eventGeneration ? this.eventTime : -1;
    this.eventGeneration = generation;
    this.eventTime = now;
    const events = action.getClip().userData?.events as FxEvent[] | undefined;
    if (!events?.length) return;
    for (const e of eventsBetween(events, prev, now)) this.fx.spawn(e);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** Draws the effect particles over the frame already on the canvas. */
  renderFx(): void {
    if (!this.fx.active) return;
    const autoClear = this.renderer.autoClear;
    this.renderer.autoClear = false;
    this.renderer.render(this.fx.scene, this.camera);
    this.renderer.autoClear = autoClear;
  }

  /**
   * Cheap contact shadow, matching the original Unity hard-shadow grounding:
   * only the character casts (the environment sets castShadow false), and
   * the baked stage is unlit MeshBasicMaterial which cannot receive - an
   * invisible ShadowMaterial plane under the character catches the
   * directional light's shadow map instead. The plane sits a hair above the
   * floor so it never z-fights the boards.
   */
  private shadowPlane: THREE.Mesh | null = null;

  private addCharacterShadow(): void {
    const caster = this.scene.children.some(
      (o) => o instanceof THREE.DirectionalLight && o.castShadow,
    );
    if (!caster) return;
    // materials.json's authored per-mesh castShadows (applyMaterials) wins;
    // only meshes it left untouched default to casting.
    const authored = new Set(
      (this.pack.materials?.materials ?? []).map((m) => m.name),
    );
    this.pack.gltf.scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      if (!mats.some((m) => authored.has(m.name))) obj.castShadow = true;
    });
    const strength = this.pack.scene?.lights?.find((l) => l.shadows !== 'none')?.shadowStrength ?? 1;
    const mat = new THREE.ShadowMaterial({ opacity: 0.35 * strength });
    this.ownedMaterials.push(mat);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), mat);
    plane.rotation.x = -Math.PI / 2;
    // Under the character root: floors offset from the world origin keep the
    // shadow under her feet.
    plane.position.copy(this.pack.gltf.scene.position);
    plane.position.y += 0.01;
    plane.receiveShadow = true;
    this.shadowPlane = plane;
    this.scene.add(plane);
  }

  dispose(): void {
    if (this.shadowPlane) {
      this.scene.remove(this.shadowPlane);
      this.shadowPlane.geometry.dispose();
      this.shadowPlane = null;
    }
    this.fx.dispose();
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.pack.gltf.scene);
    this.scene.remove(this.pack.gltf.scene);
    for (const mat of this.ownedMaterials) {
      const toon = mat as THREE.MeshToonMaterial;
      toon.gradientMap?.dispose();
      mat.dispose();
    }
    this.ownedMaterials.length = 0;
    this.pack.gltf.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) obj.geometry.dispose();
    });
    const env = this.pack.environment;
    if (env) {
      this.scene.remove(env.scene);
      env.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) obj.geometry.dispose();
      });
    }
    for (const tex of this.ownedTextures) tex.dispose();
    this.ownedTextures.length = 0;
  }
}
