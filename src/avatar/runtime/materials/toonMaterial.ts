/**
 * Clean-room port of the ACTIVE feature subset of TCP2 "Hybrid Shader 2"
 * (banded diffuse ramp, shadow tint, trilight ambient, fresnel rim, alpha
 * modes, trivial dissolve), implemented from the pack spec.
 *
 * Built by extending MeshToonMaterial via onBeforeCompile: only the fragment
 * lighting is replaced (see toonShader.ts), so the built-in vertex chunks
 * (GPU skinning, morph targets, instancing) keep working untouched.
 *
 * Light plumbing: the main directional light's direction/color and the
 * ambient/hemisphere irradiance are read from three's built-in light uniforms
 * (directionalLights[], ambientLightColor, hemisphereLights[]), so the lights
 * AvatarRuntime already adds from scene.json reach the shader with no extra
 * wiring. Shadow maps are never sampled here: all pack materials have
 * receiveShadows false and AvatarRuntime sets mesh.receiveShadow from it,
 * which keeps the shadow chunks compiled out.
 *
 * entry.renderQueue is exposed as material.userData.renderQueue for the
 * orchestrator to translate into mesh.renderOrder (a material cannot set
 * per-object render order itself).
 */

import * as THREE from 'three';
import type { MaterialEntry } from '../../pack/types';
import {
  TOON_DISSOLVE_FRAGMENT,
  TOON_LIGHTING_PARS,
  TOON_SHADER_VERSION,
  TOON_TUNING,
  glslFloat,
} from './toonShader';

export { TOON_TUNING } from './toonShader';

/** Resolves a pack texture slot name (e.g. "main") to a THREE texture, or null. */
export type TextureLookup = (name: string) => THREE.Texture | null;

/** Per-material uniform handles, exposed on material.userData.toonUniforms. */
export interface ToonMaterialUniforms {
  toonShadowColor: THREE.IUniform<THREE.Color>;
  toonRampThreshold: THREE.IUniform<number>;
  toonRampSmoothing: THREE.IUniform<number>;
  toonFresnelMin: THREE.IUniform<number>;
  toonFresnelMax: THREE.IUniform<number>;
  toonDissolveValue: THREE.IUniform<number>;
  toonDissolveMap: THREE.IUniform<THREE.Texture | null>;
}

/** smoothstep needs edge0 < edge1; also guards a zero-width ramp. */
const MIN_EDGE_SPAN = 1e-4;

/** Errors instead of silently no-opping when a chunk anchor is missing (three upgrade guard). */
function replaceOnce(source: string, anchor: string, replacement: string): string {
  const out = source.replace(anchor, replacement);
  if (out === source) {
    throw new Error(`[toonMaterial] shader anchor "${anchor}" not found; three.js chunk drift?`);
  }
  return out;
}

/**
 * Normalizes a pack texture for sampling: sRGB decode for color maps, GLTF UV
 * convention (flipY false; GLB-embedded textures already are, TextureLoader
 * defaults true), modest anisotropy. needsUpdate only when something changed
 * so an already-uploaded shared texture is not re-uploaded for nothing.
 */
function prepareTexture(tex: THREE.Texture, srgb: boolean): void {
  let dirty = false;
  const colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (tex.colorSpace !== colorSpace) {
    tex.colorSpace = colorSpace;
    dirty = true;
  }
  if (tex.flipY) {
    tex.flipY = false;
    dirty = true;
  }
  if (tex.anisotropy < 4) {
    tex.anisotropy = 4; // renderer clamps to hardware max
    dirty = true;
  }
  if (dirty) tex.needsUpdate = true;
}

/**
 * Pack color -> working-space (linear) THREE.Color. Pack colors are the
 * sRGB-encoded values Unity's inspector shows (the pack exporter decodes them
 * the same way for the GLB); read as linear they wash out (pale base colors,
 * ambient fill too strong).
 */
export function packColor(c: readonly number[]): THREE.Color {
  return new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
}

export function createToonMaterial(entry: MaterialEntry, textureLookup: TextureLookup): THREE.Material {
  const p = entry.params;
  const mat = new THREE.MeshToonMaterial();
  mat.name = entry.name;

  mat.color = packColor(p.baseColor);

  const map = textureLookup('main');
  if (map) {
    prepareTexture(map, true);
    mat.map = map;
  }

  const dissolveMap = textureLookup('dissolve');
  if (dissolveMap) prepareTexture(dissolveMap, false);

  mat.side = p.doubleSided ? THREE.DoubleSide : THREE.FrontSide;

  switch (p.alphaMode) {
    case 'opaque':
      break;
    case 'cutout':
      // Unity multiplies _BaseColor.a into the tested alpha; opacity does the same here.
      mat.alphaTest = p.cutoff;
      mat.opacity = p.baseColor[3];
      break;
    case 'blend':
      mat.transparent = true;
      mat.depthWrite = false;
      mat.opacity = p.baseColor[3];
      break;
    case 'premultiplied':
      mat.transparent = true;
      mat.premultipliedAlpha = true;
      mat.depthWrite = false;
      mat.opacity = p.baseColor[3];
      break;
  }

  // Feature + tuning defines. three folds material.defines into the program
  // cache key, so materials sharing a combo share one compiled program and
  // differing combos get distinct ones.
  const defines: Record<string, string> = {
    NEXUS_TOON_RAMP_SCALE: glslFloat(TOON_TUNING.rampNdlScale),
    NEXUS_TOON_RAMP_OFFSET: glslFloat(TOON_TUNING.rampNdlOffset),
    NEXUS_TOON_AMBIENT_SCALE: glslFloat(TOON_TUNING.ambientIntensity),
    NEXUS_TOON_SHADE_LIFT: glslFloat(TOON_TUNING.shadeLift),
    NEXUS_TOON_MIN_SMOOTH: glslFloat(TOON_TUNING.minRampSmoothing),
  };
  if (TOON_TUNING.unlit) defines.NEXUS_TOON_UNLIT = '';
  if (p.useFresnelReflections) {
    defines.NEXUS_TOON_FRESNEL = '';
    defines.NEXUS_TOON_FRESNEL_SCALE = glslFloat(TOON_TUNING.fresnelIntensity);
  }
  if (p.shadowColorFromLight) defines.NEXUS_TOON_SHADOW_LIGHT_COLOR = '';
  if (dissolveMap) {
    defines.NEXUS_TOON_DISSOLVE = '';
    defines.USE_UV = ''; // forces the vUv varying the dissolve sample reads
  }
  mat.defines = defines;

  // Allocated once per material; onBeforeCompile only wires references, so
  // recompiles keep the same value objects and nothing allocates per frame.
  const uniforms: ToonMaterialUniforms = {
    toonShadowColor: { value: packColor(p.shadowColor) },
    toonRampThreshold: { value: p.rampThreshold },
    toonRampSmoothing: { value: Math.max(p.rampSmoothing, MIN_EDGE_SPAN) },
    toonFresnelMin: { value: p.fresnelMin },
    toonFresnelMax: { value: Math.max(p.fresnelMax, p.fresnelMin + MIN_EDGE_SPAN) },
    toonDissolveValue: { value: p.dissolveValue },
    toonDissolveMap: { value: dissolveMap },
  };
  mat.userData.toonUniforms = uniforms;
  mat.userData.renderQueue = entry.renderQueue;

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = replaceOnce(
      shader.fragmentShader,
      '#include <lights_toon_pars_fragment>',
      TOON_LIGHTING_PARS,
    );
    shader.fragmentShader = replaceOnce(
      shader.fragmentShader,
      '#include <alphatest_fragment>',
      `#include <alphatest_fragment>${TOON_DISSOLVE_FRAGMENT}`,
    );
  };
  // The injected GLSL is identical for every material from this factory;
  // defines (above) carry the per-combo variation.
  mat.customProgramCacheKey = () => TOON_SHADER_VERSION;

  return mat;
}
