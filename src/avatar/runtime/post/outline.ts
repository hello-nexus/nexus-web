/**
 * Screen-space outline post effect: three.js port of the pack's Unity URP
 * fullscreen outline pass (OutlinePostProcessingMat), driven by the
 * scene.json "outline" block via outlineParamsFromScene().
 *
 * Pipeline per frame (default: exactly 2 scene passes + 1 fullscreen pass):
 *   1. scene color -> sceneTarget (half float) with a DepthTexture attached
 *   2. scene view-space normals -> normalTarget (half float) using a
 *      MeshNormalMaterial scene override (three derives skinning/morph
 *      program defines per object, so skinned + morphed meshes are correct)
 *   3. fullscreen edge detect + composite -> whatever render target was
 *      bound when render() was called (null = the canvas)
 * With params.blurMask on, pass 3 splits into mask -> tent-blur + composite:
 * one extra fullscreen pass, still 2 scene passes.
 *
 * MRT seam: renderNormalsPass() is the only place that knows normals come
 * from a second scene traversal. A future WebGL2 MRT single-pass optimization
 * (scene materials writing color + view normal to two attachments) replaces
 * that method and the two targets with one multi-texture target; the edge
 * shader and the public API are unchanged (it keeps reading tDiffuse /
 * tDepth / tNormal).
 *
 * Performance contract: all render targets, materials, and uniform value
 * objects are created once and reused; render() performs no allocations;
 * targets resize only when setSize() reports a change (msaaSamples is the one
 * param whose change rebuilds the scene target, lazily on the next render).
 */

import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import type { Color4, SceneOutline } from '../../pack/types';
import { createOutlineUniforms, OUTLINE_FRAGMENT, OUTLINE_VERTEX } from './outlineShader';

/**
 * Live-tweakable effect parameters. Doc comments name the Unity material
 * property each field maps from (see scene.json "outline.raw").
 */
export interface OutlineParams {
  /** _OutlineThickness: neighbor sample offset in CSS px (scaled by pixelRatio). */
  thickness: number;
  /** _OutlineColor rgb (linear floats, pack convention). */
  color: THREE.Color;
  /** Composite opacity of the outline; seeded from _OutlineColor alpha. */
  strength: number;

  /** _USEDEPTH (top-level scene.json useDepth wins). */
  useDepth: boolean;
  /** _DepthThresholdMin: view-depth difference where the depth edge starts. */
  depthThresholdMin: number;
  /** _DepthThresholdMax: view-depth difference of a full-strength depth edge. */
  depthThresholdMax: number;
  /** abs(_DepthThresholdStartZ): view depth where the thresholds apply 1:1. */
  depthStartZ: number;
  /** abs(_DepthMinPosZ): view depth below which threshold scaling stops shrinking. */
  depthMinZ: number;

  /** _USENORMALS (top-level scene.json useNormals wins). */
  useNormals: boolean;
  /** _NormalThresholdMin, on the summed 4-neighbor (1 - dot) scale [0, 8]. */
  normalThresholdMin: number;
  /** _NormalThresholdMax. */
  normalThresholdMax: number;

  /** _USECOLOR. */
  useColor: boolean;
  /** _ColorThresholdMin (falls back to top-level colorThreshold). */
  colorThresholdMin: number;
  /** _ColorThresholdMax. */
  colorThresholdMax: number;
  /** _ColorThickness: color taps use their own pixel offset. */
  colorThickness: number;

  /** _USENOISE (procedural value noise stands in for the unexported _NoiseTex). */
  useNoise: boolean;
  /** _NoiseScale: noise cells across the screen's U axis. */
  noiseScale: number;
  /** _NoiseThresholdMin. */
  noiseThresholdMin: number;
  /** _NoiseThresholdMax. */
  noiseThresholdMax: number;

  /** _USENORMALSURFACE: suppress outlines on surfaces facing a direction. */
  useNormalSurface: boolean;
  /** _NormalSurfaceDirection, world space (Unity x already flipped to glTF). */
  normalSurfaceDirection: THREE.Vector3;
  /** _NormalSurfaceMinDotProduct. */
  normalSurfaceMinDot: number;

  /** _FadeDistanceMin: view depth where the whole outline starts fading. */
  fadeDistanceMin: number;
  /** _FadeDistanceMax: view depth where the fade bottoms out. */
  fadeDistanceMax: number;
  /** _FadeMinimumValue: residual outline strength past fadeDistanceMax. */
  fadeMinimum: number;

  /** Optional 1-pass tent blur of the edge mask (off until the A/B pass). */
  blurMask: boolean;
  /**
   * MSAA samples for the scene color+depth target (0 = off). three resolves
   * both color and depth via blitFramebuffer; the normals target stays
   * single-sampled. Changing this rebuilds the scene target on next render.
   */
  msaaSamples: number;
}

/** Defaults mirror the reference pack's OutlinePostProcessingMat dump. */
export function defaultOutlineParams(): OutlineParams {
  return {
    thickness: 2.54,
    color: new THREE.Color(0, 0, 0),
    strength: 1,
    useDepth: true,
    depthThresholdMin: 0.001,
    depthThresholdMax: 1.17,
    depthStartZ: 3,
    depthMinZ: 1,
    useNormals: true,
    normalThresholdMin: 1.62,
    normalThresholdMax: 2.99,
    useColor: false,
    colorThresholdMin: 0.01,
    colorThresholdMax: 1,
    colorThickness: 1,
    useNoise: false,
    noiseScale: 20,
    noiseThresholdMin: 0,
    noiseThresholdMax: 1,
    useNormalSurface: false,
    normalSurfaceDirection: new THREE.Vector3(0, 1, 0),
    normalSurfaceMinDot: 0.8,
    fadeDistanceMin: 50,
    fadeDistanceMax: 400,
    fadeMinimum: 0.1,
    blurMask: false,
    msaaSamples: 0,
  };
}

function rawSection(raw: Record<string, unknown> | undefined, section: string): Record<string, unknown> | null {
  const s = raw?.[section];
  return s !== null && typeof s === 'object' ? (s as Record<string, unknown>) : null;
}

function rawFloat(raw: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const v = rawSection(raw, 'floats')?.[key];
  return typeof v === 'number' ? v : fallback;
}

function rawColor(raw: Record<string, unknown> | undefined, key: string): Color4 | null {
  const v: unknown = rawSection(raw, 'colors')?.[key];
  if (Array.isArray(v) && v.length >= 4 && v.every((n) => typeof n === 'number')) {
    return [v[0], v[1], v[2], v[3]] as Color4;
  }
  return null;
}

/**
 * Maps scene.json "outline" (typed fields + the raw Unity material dump) to
 * OutlineParams. Unity view-space Z values (_DepthThresholdStartZ = -3,
 * _DepthMinPosZ = -1; camera looks down -Z) become positive view depths.
 */
export function outlineParamsFromScene(outline: SceneOutline | undefined): OutlineParams {
  const p = defaultOutlineParams();
  if (!outline) return p;
  const raw = outline.raw;

  p.useDepth = outline.useDepth;
  p.depthThresholdMin = outline.depthThresholdMin;
  p.depthThresholdMax = outline.depthThresholdMax;
  p.depthStartZ = Math.abs(rawFloat(raw, '_DepthThresholdStartZ', -p.depthStartZ));
  p.depthMinZ = Math.abs(rawFloat(raw, '_DepthMinPosZ', -p.depthMinZ));

  p.useNormals = outline.useNormals;
  p.normalThresholdMin = rawFloat(raw, '_NormalThresholdMin', p.normalThresholdMin);
  p.normalThresholdMax = rawFloat(raw, '_NormalThresholdMax', p.normalThresholdMax);

  p.useColor = rawFloat(raw, '_USECOLOR', 0) > 0.5;
  p.colorThresholdMin = rawFloat(raw, '_ColorThresholdMin', outline.colorThreshold);
  p.colorThresholdMax = rawFloat(raw, '_ColorThresholdMax', p.colorThresholdMax);
  p.colorThickness = rawFloat(raw, '_ColorThickness', p.colorThickness);

  p.useNoise = rawFloat(raw, '_USENOISE', 0) > 0.5;
  p.noiseScale = rawFloat(raw, '_NoiseScale', p.noiseScale);
  p.noiseThresholdMin = rawFloat(raw, '_NoiseThresholdMin', p.noiseThresholdMin);
  p.noiseThresholdMax = rawFloat(raw, '_NoiseThresholdMax', p.noiseThresholdMax);

  p.useNormalSurface = rawFloat(raw, '_USENORMALSURFACE', 0) > 0.5;
  p.normalSurfaceMinDot = rawFloat(raw, '_NormalSurfaceMinDotProduct', p.normalSurfaceMinDot);
  const surfaceDir = rawColor(raw, '_NormalSurfaceDirection');
  if (surfaceDir) {
    // Same Unity -> glTF handedness x-flip the exporter applies to nodes.
    const dir = new THREE.Vector3(-surfaceDir[0], surfaceDir[1], surfaceDir[2]);
    if (dir.lengthSq() > 0) p.normalSurfaceDirection.copy(dir.normalize());
  }

  p.fadeDistanceMin = rawFloat(raw, '_FadeDistanceMin', p.fadeDistanceMin);
  p.fadeDistanceMax = rawFloat(raw, '_FadeDistanceMax', p.fadeDistanceMax);
  p.fadeMinimum = rawFloat(raw, '_FadeMinimumValue', p.fadeMinimum);

  p.thickness = rawFloat(raw, '_OutlineThickness', p.thickness);
  const color = rawColor(raw, '_OutlineColor');
  if (color) {
    p.color.setRGB(color[0], color[1], color[2], THREE.SRGBColorSpace);
    p.strength = color[3];
  }
  return p;
}

/** Decodes to the unit +Z (toward camera) view normal for empty pixels. */
const NORMAL_CLEAR_COLOR = new THREE.Color(0.5, 0.5, 1);

interface BlurResources {
  target: THREE.WebGLRenderTarget;
  maskMaterial: THREE.ShaderMaterial;
  compositeMaterial: THREE.ShaderMaterial;
}

export class OutlineEffect {
  /** When false, render() is a plain renderer.render passthrough. */
  enabled = true;
  /** Live-tweakable; every field is re-read each render(). */
  readonly params: OutlineParams;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;

  private sceneTarget: THREE.WebGLRenderTarget;
  private readonly normalTarget: THREE.WebGLRenderTarget;
  private blurResources: BlurResources | null = null;

  private readonly normalMaterial: THREE.MeshNormalMaterial;
  private readonly edgeCompositeMaterial: THREE.ShaderMaterial;
  private readonly fsQuad: FullScreenQuad;

  /** Device pixels (width/height already multiplied by pixelRatio). */
  private width: number;
  private height: number;
  private pixelRatio: number;
  private allocatedSamples: number;

  // Preallocated scratch; render() must not allocate.
  private readonly savedClearColor = new THREE.Color();
  private readonly surfaceDirView = new THREE.Vector3(0, 1, 0);

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    params?: Partial<OutlineParams>,
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.params = { ...defaultOutlineParams(), ...params };

    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.width = Math.max(1, size.x);
    this.height = Math.max(1, size.y);
    this.pixelRatio = renderer.getPixelRatio();
    this.allocatedSamples = this.params.msaaSamples;

    this.sceneTarget = this.createSceneTarget();
    this.normalTarget = new THREE.WebGLRenderTarget(this.width, this.height, {
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      depthBuffer: true,
      stencilBuffer: false,
    });

    this.normalMaterial = new THREE.MeshNormalMaterial();
    // Rasterize everything the color pass could have drawn; three flips
    // backface normals for DoubleSide, so shells/skirts stay consistent.
    this.normalMaterial.side = THREE.DoubleSide;
    this.normalMaterial.blending = THREE.NoBlending;

    this.edgeCompositeMaterial = this.createPassMaterial({});
    this.fsQuad = new FullScreenQuad(this.edgeCompositeMaterial);
  }

  private createSceneTarget(): THREE.WebGLRenderTarget {
    // UnsignedIntType depth = DEPTH_COMPONENT24 (WebGL2 guaranteed); half
    // float color keeps the linear-light scene un-banded through the chain.
    const depthTexture = new THREE.DepthTexture(this.width, this.height, THREE.UnsignedIntType);
    return new THREE.WebGLRenderTarget(this.width, this.height, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
      depthBuffer: true,
      stencilBuffer: false,
      depthTexture,
      samples: this.allocatedSamples,
    });
  }

  private createPassMaterial(defines: Record<string, string>): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader: OUTLINE_VERTEX,
      fragmentShader: OUTLINE_FRAGMENT,
      defines,
      uniforms: createOutlineUniforms(),
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
    });
  }

  private ensureBlurResources(): BlurResources {
    if (!this.blurResources) {
      this.blurResources = {
        // 8-bit single channel is plenty for a soft mask; Linear filtering is
        // load-bearing for the 4-tap tent in the composite.
        target: new THREE.WebGLRenderTarget(this.width, this.height, {
          format: THREE.RedFormat,
          type: THREE.UnsignedByteType,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          generateMipmaps: false,
          depthBuffer: false,
          stencilBuffer: false,
        }),
        maskMaterial: this.createPassMaterial({ MASK_ONLY: '' }),
        compositeMaterial: this.createPassMaterial({ BLURRED_MASK: '' }),
      };
    }
    return this.blurResources;
  }

  /** Rebuilds the scene target if params.msaaSamples changed since allocation. */
  private ensureTargets(): void {
    if (this.params.msaaSamples !== this.allocatedSamples) {
      this.sceneTarget.dispose(); // also disposes its depthTexture
      this.allocatedSamples = this.params.msaaSamples;
      this.sceneTarget = this.createSceneTarget();
    }
  }

  /** Writes params + current camera/targets into one pass material. */
  private syncMaterial(mat: THREE.ShaderMaterial): void {
    const u = mat.uniforms;
    const p = this.params;
    u.tDiffuse.value = this.sceneTarget.texture;
    u.tDepth.value = this.sceneTarget.depthTexture;
    u.tNormal.value = this.normalTarget.texture;
    u.tMask.value = this.blurResources ? this.blurResources.target.texture : null;
    (u.uTexel.value as THREE.Vector2).set(1 / this.width, 1 / this.height);
    u.uCameraNear.value = this.camera.near;
    u.uCameraFar.value = this.camera.far;
    u.uThickness.value = p.thickness * this.pixelRatio;
    u.uUseDepth.value = p.useDepth ? 1 : 0;
    u.uDepthThresholdMin.value = p.depthThresholdMin;
    u.uDepthThresholdMax.value = p.depthThresholdMax;
    u.uDepthStartZ.value = p.depthStartZ;
    u.uDepthMinZ.value = p.depthMinZ;
    u.uUseNormals.value = p.useNormals ? 1 : 0;
    u.uNormalThresholdMin.value = p.normalThresholdMin;
    u.uNormalThresholdMax.value = p.normalThresholdMax;
    u.uUseColor.value = p.useColor ? 1 : 0;
    u.uColorThresholdMin.value = p.colorThresholdMin;
    u.uColorThresholdMax.value = p.colorThresholdMax;
    u.uColorThickness.value = p.colorThickness * this.pixelRatio;
    u.uUseNoise.value = p.useNoise ? 1 : 0;
    u.uNoiseScale.value = p.noiseScale;
    u.uNoiseThresholdMin.value = p.noiseThresholdMin;
    u.uNoiseThresholdMax.value = p.noiseThresholdMax;
    u.uUseNormalSurface.value = p.useNormalSurface ? 1 : 0;
    (u.uNormalSurfaceDir.value as THREE.Vector3).copy(this.surfaceDirView);
    u.uNormalSurfaceMinDot.value = p.normalSurfaceMinDot;
    u.uFadeDistanceMin.value = p.fadeDistanceMin;
    u.uFadeDistanceMax.value = p.fadeDistanceMax;
    u.uFadeMinimum.value = p.fadeMinimum;
    (u.uOutlineColor.value as THREE.Color).copy(p.color);
    u.uStrength.value = p.strength;
  }

  /**
   * Scene pass 2: view-space normals via override material. This is the MRT
   * seam described in the file header; nothing outside this method (plus
   * normalTarget's allocation) assumes a second traversal exists.
   */
  private renderNormalsPass(): void {
    const { renderer, scene } = this;
    const prevBackground = scene.background;
    const prevOverride = scene.overrideMaterial;
    const prevShadowAuto = renderer.shadowMap.autoUpdate;
    renderer.getClearColor(this.savedClearColor);
    const prevClearAlpha = renderer.getClearAlpha();

    // Background off: the clear color must decode to a valid unit normal so
    // empty-vs-empty neighbors never register a normal edge.
    scene.background = null;
    scene.overrideMaterial = this.normalMaterial;
    // Shadow maps were already rendered by the color pass this frame.
    renderer.shadowMap.autoUpdate = false;
    renderer.setClearColor(NORMAL_CLEAR_COLOR, 1);

    renderer.setRenderTarget(this.normalTarget);
    renderer.render(scene, this.camera);

    scene.background = prevBackground;
    scene.overrideMaterial = prevOverride;
    renderer.shadowMap.autoUpdate = prevShadowAuto;
    renderer.setClearColor(this.savedClearColor, prevClearAlpha);
  }

  /**
   * Renders the outlined frame. Call instead of renderer.render(scene,
   * camera); the composite lands in whatever render target is bound at call
   * time (null = canvas), so the effect stays composable in a larger chain.
   */
  render(): void {
    const { renderer, scene, camera } = this;
    if (!this.enabled) {
      renderer.render(scene, camera);
      return;
    }

    this.ensureTargets();
    const outputTarget = renderer.getRenderTarget();

    // Pass 1: lit scene color + depth.
    renderer.setRenderTarget(this.sceneTarget);
    renderer.render(scene, camera);

    // Pass 2: normals (see method for the MRT seam).
    this.renderNormalsPass();

    // camera.matrixWorldInverse is fresh after the scene passes.
    if (this.params.useNormalSurface) {
      this.surfaceDirView.copy(this.params.normalSurfaceDirection).transformDirection(camera.matrixWorldInverse);
    }

    // Pass 3 (+4 with blurMask): fullscreen edge detect + composite.
    if (this.params.blurMask) {
      const blur = this.ensureBlurResources();
      this.syncMaterial(blur.maskMaterial);
      this.syncMaterial(blur.compositeMaterial);
      renderer.setRenderTarget(blur.target);
      this.fsQuad.material = blur.maskMaterial;
      this.fsQuad.render(renderer);
      renderer.setRenderTarget(outputTarget);
      this.fsQuad.material = blur.compositeMaterial;
      this.fsQuad.render(renderer);
    } else {
      this.syncMaterial(this.edgeCompositeMaterial);
      renderer.setRenderTarget(outputTarget);
      this.fsQuad.material = this.edgeCompositeMaterial;
      this.fsQuad.render(renderer);
    }
  }

  /**
   * Resizes the internal targets. width/height are CSS px (the renderer's
   * logical size); pixelRatio matches renderer.getPixelRatio(). No-op when
   * the resulting device size is unchanged.
   */
  setSize(width: number, height: number, pixelRatio = 1): void {
    this.pixelRatio = pixelRatio;
    const w = Math.max(1, Math.floor(width * pixelRatio));
    const h = Math.max(1, Math.floor(height * pixelRatio));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.sceneTarget.setSize(w, h);
    this.normalTarget.setSize(w, h);
    this.blurResources?.target.setSize(w, h);
  }

  dispose(): void {
    this.sceneTarget.dispose(); // also disposes its depthTexture
    this.normalTarget.dispose();
    if (this.blurResources) {
      this.blurResources.target.dispose();
      this.blurResources.maskMaterial.dispose();
      this.blurResources.compositeMaterial.dispose();
      this.blurResources = null;
    }
    this.edgeCompositeMaterial.dispose();
    this.normalMaterial.dispose();
    this.fsQuad.dispose();
  }
}
