import {
  Color, DataTexture, DataUtils, FloatType, GLSL3, HalfFloatType, Mesh, NearestFilter, OrthographicCamera, PlaneGeometry, RGBAFormat, Scene,
  ShaderMaterial, Vector2, Vector3, WebGLRenderTarget, type Texture, type WebGLRenderer,
} from 'three';
import { DAMPING, FAN_BLEND, JACOBI_ITERATIONS, VMAX_CELLS } from './flowParams';
import type { FlowScene } from './gridScene';
import { ADVECT, AGE, DIVERGE, FULLSCREEN_VERTEX, GRADIENT, JACOBI, REDUCE_FIRST, REDUCE_NEXT } from './shaders';

export type FloatKind = typeof FloatType | typeof HalfFloatType;

/** The float render-target type this context can draw to: 32-bit when EXT_color_buffer_float is there, else half-float, else null. */
export function floatSupport(renderer: WebGLRenderer): FloatKind | null {
  if (renderer.extensions.has('EXT_color_buffer_float')) return FloatType;
  if (renderer.extensions.has('EXT_color_buffer_half_float')) return HalfFloatType;
  return null;
}

/** Draws a full-screen triangle with one material into a render target. */
export class PassRunner {
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly mesh: Mesh;
  private readonly geometry = new PlaneGeometry(2, 2);
  private readonly renderer: WebGLRenderer;

  constructor(renderer: WebGLRenderer) {
    this.renderer = renderer;
    this.mesh = new Mesh(this.geometry);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  run(material: ShaderMaterial, target: WebGLRenderTarget) {
    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const prevAuto = r.autoClear;
    this.mesh.material = material;
    r.autoClear = false;
    r.setRenderTarget(target);
    r.render(this.scene, this.camera);
    r.setRenderTarget(prevTarget);
    r.autoClear = prevAuto;
  }

  dispose() {
    this.geometry.dispose();
  }
}

export function pass(fragmentShader: string, uniforms: ShaderMaterial['uniforms']): ShaderMaterial {
  return new ShaderMaterial({
    glslVersion: GLSL3, vertexShader: FULLSCREEN_VERTEX, fragmentShader, uniforms, depthTest: false, depthWrite: false,
  });
}

export function target(w: number, h: number, type: FloatKind): WebGLRenderTarget {
  return new WebGLRenderTarget(w, h, {
    type, format: RGBAFormat, minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
  });
}

function f16(h: number): number {
  const s = h & 0x8000 ? -1 : 1;
  const e = (h >> 10) & 31;
  const m = h & 1023;
  return e === 0 ? s * m * 2 ** -24 : e === 31 ? (m ? NaN : s * Infinity) : s * (1 + m / 1024) * 2 ** (e - 15);
}

/** The packed 2D texture size for a grid: `tx` slices per row. */
export function packLayout(dims: [number, number, number]): { tx: number; w: number; h: number } {
  const [NX, NY, NZ] = dims;
  const tx = Math.ceil(Math.sqrt((NZ * NY) / NX));
  return { tx, w: NX * tx, h: NY * Math.ceil(NZ / tx) };
}

function dataTexture(data: Float32Array, w: number, h: number, type: FloatKind): DataTexture {
  let payload: Float32Array | Uint16Array = data;
  if (type === HalfFloatType) {
    payload = new Uint16Array(data.length);
    for (let i = 0; i < data.length; i++) payload[i] = DataUtils.toHalfFloat(data[i]);
  }
  const t = new DataTexture(payload, w, h, RGBAFormat, type);
  t.minFilter = NearestFilter;
  t.magFilter = NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** The solver on the GPU: ping-pong velocity and pressure targets, the packed obstacle and fan textures, and the step. */
export class GlFlow {
  readonly w: number;
  readonly h: number;
  readonly tx: number;
  readonly type: FloatKind;
  private readonly renderer: WebGLRenderer;
  private readonly runner: PassRunner;
  private current: FlowScene;
  private readonly vel: WebGLRenderTarget[];
  private readonly pres: WebGLRenderTarget[];
  private readonly div: WebGLRenderTarget;
  private readonly age: WebGLRenderTarget[];
  private readonly reduceTargets: WebGLRenderTarget[] = [];
  private mask: DataTexture;
  private fan: DataTexture;
  private cur = 0;
  private prev = 0;
  private ageCur = 0;
  private readonly advect: ShaderMaterial;
  private readonly diverge: ShaderMaterial;
  private readonly jacobi: ShaderMaterial;
  private readonly gradient: ShaderMaterial;
  private readonly ageMat: ShaderMaterial;
  private readonly reduceFirst: ShaderMaterial;
  private readonly reduceNext: ShaderMaterial;
  private readonly readBuffer: Float32Array | Uint16Array;
  private presCur = 0;

  constructor(renderer: WebGLRenderer, runner: PassRunner, scene: FlowScene, type: FloatKind) {
    this.renderer = renderer;
    this.runner = runner;
    this.current = scene;
    this.type = type;
    const layout = packLayout(scene.dims);
    this.tx = layout.tx;
    this.w = layout.w;
    this.h = layout.h;
    this.vel = [0, 1, 2].map(() => target(this.w, this.h, type));
    this.pres = [0, 1].map(() => target(this.w, this.h, type));
    this.div = target(this.w, this.h, type);
    this.age = [0, 1].map(() => target(this.w, this.h, type));
    let rw = this.w;
    let rh = this.h;
    do {
      rw = Math.ceil(rw / 4);
      rh = Math.ceil(rh / 4);
      this.reduceTargets.push(target(rw, rh, type));
    } while (rw > 1 || rh > 1);
    this.readBuffer = type === FloatType ? new Float32Array(4) : new Uint16Array(4);
    this.mask = dataTexture(new Float32Array(4), 1, 1, type);
    this.fan = dataTexture(new Float32Array(4), 1, 1, type);

    const common = () => ({ uN: { value: new Vector3(...scene.dims) }, uTX: { value: this.tx }, M: { value: this.mask }, U: { value: null as Texture | null } });
    this.advect = pass(ADVECT, { ...common(), F: { value: this.fan }, uBlend: { value: FAN_BLEND }, uDamp: { value: DAMPING }, uVmax: { value: VMAX_CELLS } });
    this.diverge = pass(DIVERGE, common());
    this.jacobi = pass(JACOBI, { ...common(), P: { value: null as Texture | null }, D: { value: this.div.texture } });
    this.gradient = pass(GRADIENT, { ...common(), P: { value: null as Texture | null }, uVmax: { value: VMAX_CELLS } });
    this.ageMat = pass(AGE, {
      ...common(), AG: { value: null as Texture | null },
      uCaseMin: { value: new Vector3(...scene.caseMin) }, uCaseMax: { value: new Vector3(...scene.caseMax) },
    });
    this.reduceFirst = pass(REDUCE_FIRST, { A: { value: null as Texture | null }, B: { value: null as Texture | null }, S: { value: new Vector2(this.w, this.h) } });
    this.reduceNext = pass(REDUCE_NEXT, { A: { value: null as Texture | null }, S: { value: new Vector2() } });
    this.upload();
    this.reset();
  }

  get scene(): FlowScene {
    return this.current;
  }

  /** Swaps in an edited scene of the same grid and keeps the velocity field as the starting point of the next solve. */
  setScene(scene: FlowScene) {
    this.current = scene;
    (this.ageMat.uniforms.uCaseMin.value as Vector3).set(...scene.caseMin);
    (this.ageMat.uniforms.uCaseMax.value as Vector3).set(...scene.caseMax);
    this.upload();
  }

  get velocity(): Texture {
    return this.vel[this.cur].texture;
  }

  get ageTexture(): Texture {
    return this.age[this.ageCur].texture;
  }

  get maskTexture(): Texture {
    return this.mask;
  }

  /** Writes the scene's obstacles, openings, fans and heat into the packed textures; the velocity field is kept (warm start). */
  upload() {
    const [NX, NY, NZ] = this.current.dims;
    const m = new Float32Array(this.w * this.h * 4);
    const f = new Float32Array(this.w * this.h * 4);
    const { solid, darcy, open, heat, target: tgt, fanCell } = this.current;
    for (let k = 0; k < NZ; k++) {
      const ox = (k % this.tx) * NX;
      const oy = Math.floor(k / this.tx) * NY;
      for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        const c = i + NX * (j + NY * k);
        const o = ((oy + j) * this.w + ox + i) * 4;
        m[o] = solid[c]; m[o + 1] = darcy[c]; m[o + 2] = open[c]; m[o + 3] = heat[c];
        f[o] = tgt[c * 3]; f[o + 1] = tgt[c * 3 + 1]; f[o + 2] = tgt[c * 3 + 2]; f[o + 3] = fanCell[c];
      }
    }
    this.mask.dispose();
    this.fan.dispose();
    this.mask = dataTexture(m, this.w, this.h, this.type);
    this.fan = dataTexture(f, this.w, this.h, this.type);
    for (const mat of [this.advect, this.diverge, this.jacobi, this.gradient, this.ageMat]) mat.uniforms.M.value = this.mask;
    this.advect.uniforms.F.value = this.fan;
  }

  reset() {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    const clearColor = r.getClearColor(new Color());
    const clearAlpha = r.getClearAlpha();
    r.setClearColor(0x000000, 0);
    for (const t of [...this.vel, ...this.pres, this.div, ...this.age]) {
      r.setRenderTarget(t);
      r.clear(true, false, false);
    }
    r.setClearColor(clearColor, clearAlpha);
    r.setRenderTarget(prev);
    this.cur = 0;
    this.presCur = 0;
    this.ageCur = 0;
  }

  step() {
    const u0 = this.vel[this.cur];
    const u1 = this.vel[(this.cur + 1) % 3];
    const u2 = this.vel[(this.cur + 2) % 3];
    this.advect.uniforms.U.value = u0.texture;
    this.runner.run(this.advect, u1);
    this.diverge.uniforms.U.value = u1.texture;
    this.runner.run(this.diverge, this.div);
    let pi = this.presCur;
    for (let i = 0; i < JACOBI_ITERATIONS; i++) {
      this.jacobi.uniforms.P.value = this.pres[pi].texture;
      this.runner.run(this.jacobi, this.pres[1 - pi]);
      pi = 1 - pi;
    }
    this.presCur = pi;
    this.gradient.uniforms.U.value = u1.texture;
    this.gradient.uniforms.P.value = this.pres[pi].texture;
    this.runner.run(this.gradient, u2);
    this.prev = this.cur;
    this.cur = (this.cur + 2) % 3;
  }

  /** Clears the mean-age field. */
  resetAge() {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    const clearColor = r.getClearColor(new Color());
    const clearAlpha = r.getClearAlpha();
    r.setClearColor(0x000000, 0);
    for (const t of this.age) {
      r.setRenderTarget(t);
      r.clear(true, false, false);
    }
    r.setClearColor(clearColor, clearAlpha);
    r.setRenderTarget(prev);
    this.ageCur = 0;
  }

  /** One mean-age step on the current velocity. */
  stepAge() {
    this.ageMat.uniforms.U.value = this.vel[this.cur].texture;
    this.ageMat.uniforms.AG.value = this.age[this.ageCur].texture;
    this.runner.run(this.ageMat, this.age[1 - this.ageCur]);
    this.ageCur = 1 - this.ageCur;
  }

  /** The whole velocity field as 3 floats per cell, read back from the GPU; for checks against the CPU reference. */
  readVelocity(): Float32Array {
    const [NX, NY, NZ] = this.current.dims;
    const raw = this.type === FloatType ? new Float32Array(this.w * this.h * 4) : new Uint16Array(this.w * this.h * 4);
    this.renderer.readRenderTargetPixels(this.vel[this.cur], 0, 0, this.w, this.h, raw as never);
    const out = new Float32Array(NX * NY * NZ * 3);
    for (let k = 0; k < NZ; k++) {
      const ox = (k % this.tx) * NX;
      const oy = Math.floor(k / this.tx) * NY;
      for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        const o = ((oy + j) * this.w + ox + i) * 4;
        const c = i + NX * (j + NY * k);
        for (let a = 0; a < 3; a++) out[c * 3 + a] = this.type === FloatType ? raw[o + a] : f16(raw[o + a]);
      }
    }
    return out;
  }

  /** Largest velocity change over the last step and largest velocity, cells per step; reads one texel back. */
  measure(): { du: number; u: number } {
    this.reduceFirst.uniforms.A.value = this.vel[this.cur].texture;
    this.reduceFirst.uniforms.B.value = this.vel[this.prev].texture;
    this.runner.run(this.reduceFirst, this.reduceTargets[0]);
    for (let i = 1; i < this.reduceTargets.length; i++) {
      const src = this.reduceTargets[i - 1];
      this.reduceNext.uniforms.A.value = src.texture;
      (this.reduceNext.uniforms.S.value as Vector2).set(src.width, src.height);
      this.runner.run(this.reduceNext, this.reduceTargets[i]);
    }
    const last = this.reduceTargets[this.reduceTargets.length - 1];
    this.renderer.readRenderTargetPixels(last, 0, 0, 1, 1, this.readBuffer as never);
    const b = this.readBuffer;
    return this.type === FloatType ? { du: b[0], u: b[1] } : { du: f16(b[0]), u: f16(b[1]) };
  }

  dispose() {
    for (const t of [...this.vel, ...this.pres, this.div, ...this.age, ...this.reduceTargets]) t.dispose();
    this.mask.dispose();
    this.fan.dispose();
    for (const m of [this.advect, this.diverge, this.jacobi, this.gradient, this.ageMat, this.reduceFirst, this.reduceNext]) m.dispose();
  }
}
