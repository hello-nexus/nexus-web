/**
 * GLSL + uniform factory for the screen-space outline pass (see ./outline.ts
 * for the pipeline and the scene.json parameter mapping).
 *
 * One fragment source serves all three pass materials via defines:
 * - (none)       edge detect + composite in a single fullscreen pass (default)
 * - MASK_ONLY    edge detect only, mask written to the R channel
 * - BLURRED_MASK composite that reads the mask from tMask through a 3x3 tent
 *                (4 bilinear taps) instead of computing it inline
 *
 * Depth is linearized with three's perspectiveDepthToViewZ (camera near/far
 * uniforms); all "view depth" values below are positive eye-space distances.
 * Normals are the view-space MeshNormalMaterial encoding (n * 0.5 + 0.5).
 */

import * as THREE from 'three';

export const OUTLINE_VERTEX = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  // FullScreenQuad geometry is already in NDC; skip the camera matrices.
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;

export const OUTLINE_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform sampler2D tNormal;
#ifdef BLURRED_MASK
uniform sampler2D tMask;
#endif

uniform vec2 uTexel;
uniform float uCameraNear;
uniform float uCameraFar;
uniform float uThickness;

uniform float uUseDepth;
uniform float uDepthThresholdMin;
uniform float uDepthThresholdMax;
uniform float uDepthStartZ;
uniform float uDepthMinZ;

uniform float uUseNormals;
uniform float uNormalThresholdMin;
uniform float uNormalThresholdMax;

uniform float uUseColor;
uniform float uColorThresholdMin;
uniform float uColorThresholdMax;
uniform float uColorThickness;

uniform float uUseNoise;
uniform float uNoiseScale;
uniform float uNoiseThresholdMin;
uniform float uNoiseThresholdMax;

uniform float uUseNormalSurface;
uniform vec3 uNormalSurfaceDir;
uniform float uNormalSurfaceMinDot;

uniform float uFadeDistanceMin;
uniform float uFadeDistanceMax;
uniform float uFadeMinimum;

uniform vec3 uOutlineColor;
uniform float uStrength;

varying vec2 vUv;

#include <packing>

float readDepth(vec2 uv) {
  return texture2D(tDepth, uv).x;
}

/** Non-linear depth buffer value -> positive eye-space distance. */
float toViewDepth(float depth) {
  return -perspectiveDepthToViewZ(depth, uCameraNear, uCameraFar);
}

vec3 readNormal(vec2 uv) {
  return normalize(texture2D(tNormal, uv).xyz * 2.0 - 1.0);
}

float luminance601(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

/** Value noise standing in for Unity's _NoiseTex (not exported in the pack). */
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 s = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, s.x), mix(c, d, s.x), s.y);
}

float outlineMask(vec2 uv) {
  float centerDepth = readDepth(uv);
  // Background pixels (cleared depth at the far plane) never outline; the
  // silhouette line lands on the character side via the positive-only
  // neighbor-minus-center depth difference below, so the mask cannot bleed
  // onto the background half of the silhouette.
  if (centerDepth >= 0.999999) return 0.0;

  float centerZ = toViewDepth(centerDepth);
  vec2 du = vec2(uTexel.x * uThickness, 0.0);
  vec2 dv = vec2(0.0, uTexel.y * uThickness);

  float edge = 0.0;
  vec3 centerN = readNormal(uv);

  if (uUseDepth > 0.5) {
    float diff = 0.0;
    diff += max(toViewDepth(readDepth(uv + du)) - centerZ, 0.0);
    diff += max(toViewDepth(readDepth(uv - du)) - centerZ, 0.0);
    diff += max(toViewDepth(readDepth(uv + dv)) - centerZ, 0.0);
    diff += max(toViewDepth(readDepth(uv - dv)) - centerZ, 0.0);
    // _DepthThresholdStartZ / _DepthMinPosZ: thresholds scale linearly with
    // view depth (clamped below at uDepthMinZ), so near surfaces keep small
    // thresholds and distant slanted surfaces stop self-outlining. At exactly
    // uDepthStartZ distance the scene.json thresholds apply verbatim.
    float atten = max(centerZ, uDepthMinZ) / max(uDepthStartZ, 1e-4);
    edge = smoothstep(uDepthThresholdMin * atten, uDepthThresholdMax * atten, diff);
  }

  if (uUseNormals > 0.5) {
    float diff = 0.0;
    diff += 1.0 - dot(centerN, readNormal(uv + du));
    diff += 1.0 - dot(centerN, readNormal(uv - du));
    diff += 1.0 - dot(centerN, readNormal(uv + dv));
    diff += 1.0 - dot(centerN, readNormal(uv - dv));
    // Sum over 4 neighbors is in [0, 8]; the Unity thresholds (1.62 / 2.99)
    // are on this same summed scale.
    edge = max(edge, smoothstep(uNormalThresholdMin, uNormalThresholdMax, diff));
  }

  if (uUseColor > 0.5) {
    vec2 cu = vec2(uTexel.x * uColorThickness, 0.0);
    vec2 cv = vec2(0.0, uTexel.y * uColorThickness);
    float centerL = luminance601(texture2D(tDiffuse, uv).rgb);
    float diff = 0.0;
    diff += abs(luminance601(texture2D(tDiffuse, uv + cu).rgb) - centerL);
    diff += abs(luminance601(texture2D(tDiffuse, uv - cu).rgb) - centerL);
    diff += abs(luminance601(texture2D(tDiffuse, uv + cv).rgb) - centerL);
    diff += abs(luminance601(texture2D(tDiffuse, uv - cv).rgb) - centerL);
    edge = max(edge, smoothstep(uColorThresholdMin, uColorThresholdMax, diff));
  }

  // _USENORMALSURFACE: suppress outlines on surfaces facing a given world
  // direction (e.g. an upward-facing ground plane).
  if (uUseNormalSurface > 0.5 && dot(centerN, uNormalSurfaceDir) >= uNormalSurfaceMinDot) {
    edge = 0.0;
  }

  if (uUseNoise > 0.5) {
    edge *= smoothstep(uNoiseThresholdMin, uNoiseThresholdMax, valueNoise(uv * uNoiseScale));
  }

  // _FadeDistance*: fade the whole outline toward uFadeMinimum with distance.
  edge *= mix(1.0, uFadeMinimum, smoothstep(uFadeDistanceMin, uFadeDistanceMax, centerZ));
  return edge;
}

void main() {
#ifdef MASK_ONLY
  gl_FragColor = vec4(outlineMask(vUv), 0.0, 0.0, 1.0);
#else
  #ifdef BLURRED_MASK
  // 3x3 tent in 4 bilinear taps (half-texel diagonal offsets).
  float mask = 0.25 * (
    texture2D(tMask, vUv + uTexel * vec2( 0.5,  0.5)).r +
    texture2D(tMask, vUv + uTexel * vec2(-0.5,  0.5)).r +
    texture2D(tMask, vUv + uTexel * vec2( 0.5, -0.5)).r +
    texture2D(tMask, vUv + uTexel * vec2(-0.5, -0.5)).r);
  #else
  float mask = outlineMask(vUv);
  #endif
  vec4 sceneColor = texture2D(tDiffuse, vUv);
  vec3 outlined = mix(sceneColor.rgb, uOutlineColor, clamp(mask * uStrength, 0.0, 1.0));
  gl_FragColor = vec4(outlined, sceneColor.a);
  // Scene color stays linear through the chain; only the final program
  // rendering to the canvas applies the renderer's output color space here.
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
#endif
}
`;

/**
 * Fresh uniform set for one pass material. Texture uniforms are (re)bound and
 * scalars synced from OutlineParams every frame by OutlineEffect, so the
 * initial values here are placeholders only.
 */
export function createOutlineUniforms(): Record<string, THREE.IUniform> {
  return {
    tDiffuse: { value: null },
    tDepth: { value: null },
    tNormal: { value: null },
    tMask: { value: null },
    uTexel: { value: new THREE.Vector2(1e-3, 1e-3) },
    uCameraNear: { value: 0.1 },
    uCameraFar: { value: 100 },
    uThickness: { value: 2 },
    uUseDepth: { value: 1 },
    uDepthThresholdMin: { value: 0.001 },
    uDepthThresholdMax: { value: 1.17 },
    uDepthStartZ: { value: 3 },
    uDepthMinZ: { value: 1 },
    uUseNormals: { value: 1 },
    uNormalThresholdMin: { value: 1.62 },
    uNormalThresholdMax: { value: 2.99 },
    uUseColor: { value: 0 },
    uColorThresholdMin: { value: 0.01 },
    uColorThresholdMax: { value: 1 },
    uColorThickness: { value: 1 },
    uUseNoise: { value: 0 },
    uNoiseScale: { value: 20 },
    uNoiseThresholdMin: { value: 0 },
    uNoiseThresholdMax: { value: 1 },
    uUseNormalSurface: { value: 0 },
    uNormalSurfaceDir: { value: new THREE.Vector3(0, 1, 0) },
    uNormalSurfaceMinDot: { value: 0.8 },
    uFadeDistanceMin: { value: 50 },
    uFadeDistanceMax: { value: 400 },
    uFadeMinimum: { value: 0.1 },
    uOutlineColor: { value: new THREE.Color(0, 0, 0) },
    uStrength: { value: 1 },
  };
}
