import {
  DataUtils, ExternalTexture, FloatType, GLSL3, HalfFloatType, Mesh, NearestFilter, OrthographicCamera, PlaneGeometry, RGBAFormat, Scene, UnsignedByteType,
  ShaderMaterial, Vector4, WebGLRenderTarget, type Texture, type WebGLRenderer,
} from 'three';
import { DAMPING, FAN_BLEND, JACOBI_ITERATIONS, VMAX_CELLS } from './flowParams';
import type { FlowScene } from './gridScene';
import { ADVECT, DIVERGE, ENCODE, FULLSCREEN_VERTEX, GRADIENT, JACOBI, REDUCE_FIRST, REDUCE_NEXT } from './shaders';

export type FloatKind = typeof FloatType | typeof HalfFloatType;

/** The float render-target type this context can draw to: 32-bit when EXT_color_buffer_float is there, else half-float, else null. */
export function floatSupport(renderer: WebGLRenderer): FloatKind | null {
  if (renderer.extensions.has('EXT_color_buffer_float') && renderable(renderer, FloatType)) return FloatType;
  if ((renderer.extensions.has('EXT_color_buffer_half_float') || renderer.extensions.has('EXT_color_buffer_float')) && renderable(renderer, HalfFloatType)) return HalfFloatType;
  return null;
}

// A float extension can be advertised and still give an incomplete framebuffer; draw to a 1x1 target and ask.
function renderable(renderer: WebGLRenderer, type: FloatKind): boolean {
  const gl = renderer.getContext();
  const probe = target(1, 1, type);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(probe);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  renderer.setRenderTarget(prev);
  probe.dispose();
  return ok;
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

export function target(w: number, h: number, type: FloatKind | typeof UnsignedByteType): WebGLRenderTarget {
  return new WebGLRenderTarget(w, h, {
    type, format: RGBAFormat, minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
  });
}

/** The packed 2D texture size for a grid: `tx` slices per row. */
export function packLayout(dims: [number, number, number]): { tx: number; w: number; h: number } {
  const [NX, NY, NZ] = dims;
  const tx = Math.ceil(Math.sqrt((NZ * NY) / NX));
  return { tx, w: NX * tx, h: NY * Math.ceil(NZ / tx) };
}

function f16(h: number): number {
  const s = h & 0x8000 ? -1 : 1;
  const e = (h >> 10) & 31;
  const m = h & 1023;
  return e === 0 ? s * m * 2 ** -24 : e === 31 ? (m ? NaN : s * Infinity) : s * (1 + m / 1024) * 2 ** (e - 15);
}

const VERTEX = '#version 300 es\nin vec2 a;\nvoid main() { gl_Position = vec4(a, 0.0, 1.0); }\n';
const FRAGMENT_HEADER = '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\n';

interface RawProgram {
  program: WebGLProgram;
  locations: Map<string, WebGLUniformLocation | null>;
}

interface RawTarget {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
}

type Uniforms = {
  textures?: Record<string, WebGLTexture>;
  floats?: Record<string, number>;
  ints?: Record<string, number[]>;
  vec3s?: Record<string, readonly number[]>;
};

/**
 * The solver on the GPU. The passes are raw WebGL2 on the renderer's own context, because a three.js render call per pass
 * costs more CPU than the pass costs the GPU; `renderer.resetState()` after each batch hands the context back.
 */
export class GlFlow {
  readonly w: number;
  readonly h: number;
  readonly tx: number;
  readonly type: FloatKind;
  private readonly renderer: WebGLRenderer;
  private readonly gl: WebGL2RenderingContext;
  private current: FlowScene;
  private readonly vao: WebGLVertexArrayObject;
  private readonly quad: WebGLBuffer;
  private readonly programs: Record<'advect' | 'diverge' | 'jacobi' | 'gradient' | 'reduceFirst' | 'reduceNext' | 'encode', RawProgram>;
  private readonly vel: RawTarget[];
  private readonly pres: RawTarget[];
  private readonly div: RawTarget;
  private readonly reduce: RawTarget[] = [];
  private readonly encoded: RawTarget;
  private readonly maskTex: WebGLTexture;
  private readonly fanTex: WebGLTexture;
  private readonly velWrap: ExternalTexture[];
  private readonly maskWrap: ExternalTexture;
  /** Scratch objects reused by every pass, so a solver step allocates none. */
  private readonly viewport = new Vector4();
  private readonly uniforms = {
    advect: { textures: {} as Record<string, WebGLTexture>, floats: { uBlend: FAN_BLEND, uDamp: DAMPING, uVmax: VMAX_CELLS } },
    diverge: { textures: {} as Record<string, WebGLTexture> },
    jacobi: { textures: {} as Record<string, WebGLTexture> },
    gradient: { textures: {} as Record<string, WebGLTexture>, floats: { uVmax: VMAX_CELLS } },
    reduceFirst: { textures: {} as Record<string, WebGLTexture>, ints: { S: [0, 0] } },
    reduceNext: { textures: {} as Record<string, WebGLTexture>, ints: { S: [0, 0] } },
    encode: { textures: {} as Record<string, WebGLTexture> },
  };
  private cur = 0;
  private prev = 0;
  private presCur = 0;
  private inFlight: { fence: WebGLSync; buffer: WebGLBuffer } | null = null;

  constructor(renderer: WebGLRenderer, scene: FlowScene, type: FloatKind) {
    this.renderer = renderer;
    this.gl = renderer.getContext() as WebGL2RenderingContext;
    const gl = this.gl;
    this.current = scene;
    this.type = type;
    const layout = packLayout(scene.dims);
    this.tx = layout.tx;
    this.w = layout.w;
    this.h = layout.h;
    this.quad = gl.createBuffer()!;
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.programs = {
      advect: this.build(ADVECT), diverge: this.build(DIVERGE), jacobi: this.build(JACOBI), gradient: this.build(GRADIENT),
      reduceFirst: this.build(REDUCE_FIRST), reduceNext: this.build(REDUCE_NEXT), encode: this.build(ENCODE),
    };
    this.vel = [0, 1, 2].map(() => this.makeTarget(this.w, this.h, false));
    this.pres = [0, 1].map(() => this.makeTarget(this.w, this.h, false));
    this.div = this.makeTarget(this.w, this.h, false);
    let rw = this.w;
    let rh = this.h;
    do {
      rw = Math.ceil(rw / 4);
      rh = Math.ceil(rh / 4);
      this.reduce.push(this.makeTarget(rw, rh, false));
    } while (rw > 1 || rh > 1);
    this.encoded = this.makeTarget(1, 1, true);
    this.maskTex = this.makeTexture(this.w, this.h, false);
    this.fanTex = this.makeTexture(this.w, this.h, false);
    const wrap = (t: WebGLTexture) => new ExternalTexture(t);
    this.velWrap = this.vel.map(t => wrap(t.texture));
    this.maskWrap = wrap(this.maskTex);
    this.upload();
    this.reset();
  }

  private build(fragment: string): RawProgram {
    const gl = this.gl;
    const program = gl.createProgram()!;
    for (const [kind, src] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT_HEADER + fragment]] as const) {
      const sh = gl.createShader(kind)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(`flow shader: ${gl.getShaderInfoLog(sh) ?? 'compile failed'}`);
      gl.attachShader(program, sh);
      gl.deleteShader(sh);
    }
    gl.bindAttribLocation(program, 0, 'a');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`flow program: ${gl.getProgramInfoLog(program) ?? 'link failed'}`);
    return { program, locations: new Map() };
  }

  private makeTexture(w: number, h: number, bytes: boolean): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    const half = this.type === HalfFloatType;
    gl.texImage2D(gl.TEXTURE_2D, 0, bytes ? gl.RGBA8 : half ? gl.RGBA16F : gl.RGBA32F, w, h, 0, gl.RGBA, bytes ? gl.UNSIGNED_BYTE : half ? gl.HALF_FLOAT : gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private makeTarget(w: number, h: number, bytes: boolean): RawTarget {
    const gl = this.gl;
    const texture = this.makeTexture(w, h, bytes);
    const framebuffer = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    return { texture, framebuffer, width: w, height: h };
  }

  private draw(program: RawProgram, into: RawTarget, u: Uniforms) {
    const gl = this.gl;
    gl.useProgram(program.program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, into.framebuffer);
    gl.viewport(0, 0, into.width, into.height);
    const loc = (name: string) => {
      let l = program.locations.get(name);
      if (l === undefined) { l = gl.getUniformLocation(program.program, name); program.locations.set(name, l); }
      return l;
    };
    gl.uniform3f(loc('uN'), this.current.dims[0], this.current.dims[1], this.current.dims[2]);
    gl.uniform1f(loc('uTX'), this.tx);
    let unit = 0;
    // for-in, not Object.entries: this runs for every pass of every solver step, so it allocates nothing.
    for (const name in u.textures) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, u.textures[name]);
      gl.uniform1i(loc(name), unit++);
    }
    for (const name in u.floats) gl.uniform1f(loc(name), u.floats[name]);
    for (const name in u.ints) gl.uniform2i(loc(name), u.ints[name][0], u.ints[name][1]);
    for (const name in u.vec3s) gl.uniform3f(loc(name), u.vec3s[name][0], u.vec3s[name][1], u.vec3s[name][2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Runs `batch` as raw GL, then hands the context back to three.js with its state cache cleared and its viewport restored. */
  private raw(batch: () => void) {
    const gl = this.gl;
    const viewport = this.renderer.getCurrentViewport(this.viewport);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.SCISSOR_TEST);
    gl.bindVertexArray(this.vao);
    try {
      batch();
    } finally {
      gl.bindVertexArray(null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.renderer.resetState();
      gl.viewport(viewport.x, viewport.y, viewport.z, viewport.w);
    }
  }

  get scene(): FlowScene {
    return this.current;
  }

  /** Swaps in an edited scene of the same grid and keeps the velocity field as the starting point of the next solve. */
  setScene(scene: FlowScene) {
    this.current = scene;
    this.upload();
  }

  get velocity(): Texture {
    return this.velWrap[this.cur];
  }

  get maskTexture(): Texture {
    return this.maskWrap;
  }

  private encodeFloats(data: Float32Array): Float32Array | Uint16Array {
    if (this.type === FloatType) return data;
    const out = new Uint16Array(data.length);
    for (let i = 0; i < data.length; i++) out[i] = DataUtils.toHalfFloat(data[i]);
    return out;
  }

  /** Writes the scene's obstacles, openings, fans and heat into the packed textures; the velocity field is kept (warm start). */
  upload() {
    const gl = this.gl;
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
    const half = this.type === HalfFloatType;
    for (const [tex, data] of [[this.maskTex, m], [this.fanTex, f]] as const) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.w, this.h, gl.RGBA, half ? gl.HALF_FLOAT : gl.FLOAT, this.encodeFloats(data));
    }
    this.renderer.resetState();
  }

  private clear(targets: RawTarget[]) {
    const gl = this.gl;
    for (const t of targets) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.framebuffer);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.renderer.resetState();
  }

  reset() {
    this.clear([...this.vel, ...this.pres, this.div]);
    this.cur = 0;
    this.presCur = 0;
  }

  /** `count` solver steps in one batch of raw GL. */
  step(count = 1) {
    this.raw(() => {
      for (let n = 0; n < count; n++) this.stepOnce();
    });
  }

  private stepOnce() {
    const p = this.programs;
    const u0 = this.vel[this.cur];
    const u1 = this.vel[(this.cur + 1) % 3];
    const u2 = this.vel[(this.cur + 2) % 3];
    const un = this.uniforms;
    un.advect.textures.U = u0.texture;
    un.advect.textures.M = this.maskTex;
    un.advect.textures.F = this.fanTex;
    this.draw(p.advect, u1, un.advect);
    un.diverge.textures.U = u1.texture;
    un.diverge.textures.M = this.maskTex;
    this.draw(p.diverge, this.div, un.diverge);
    let pi = this.presCur;
    for (let i = 0; i < JACOBI_ITERATIONS; i++) {
      un.jacobi.textures.P = this.pres[pi].texture;
      un.jacobi.textures.D = this.div.texture;
      un.jacobi.textures.M = this.maskTex;
      this.draw(p.jacobi, this.pres[1 - pi], un.jacobi);
      pi = 1 - pi;
    }
    this.presCur = pi;
    un.gradient.textures.U = u1.texture;
    un.gradient.textures.P = this.pres[pi].texture;
    un.gradient.textures.M = this.maskTex;
    this.draw(p.gradient, u2, un.gradient);
    this.prev = this.cur;
    this.cur = (this.cur + 2) % 3;
  }

  /** The whole velocity field as 3 floats per cell, read back from the GPU; for checks against the CPU reference. */
  readVelocity(): Float32Array {
    const gl = this.gl;
    const [NX, NY, NZ] = this.current.dims;
    const half = this.type === HalfFloatType;
    const raw = half ? new Uint16Array(this.w * this.h * 4) : new Float32Array(this.w * this.h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.vel[this.cur].framebuffer);
    gl.readPixels(0, 0, this.w, this.h, gl.RGBA, half ? gl.HALF_FLOAT : gl.FLOAT, raw);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.renderer.resetState();
    const out = new Float32Array(NX * NY * NZ * 3);
    for (let k = 0; k < NZ; k++) {
      const ox = (k % this.tx) * NX;
      const oy = Math.floor(k / this.tx) * NY;
      for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        const o = ((oy + j) * this.w + ox + i) * 4;
        const c = i + NX * (j + NY * k);
        for (let a = 0; a < 3; a++) out[c * 3 + a] = half ? f16(raw[o + a]) : raw[o + a];
      }
    }
    return out;
  }

  /** Starts a GPU reduction of the last step's velocity change and top speed, read back through a PBO and fence; false while one is in flight. */
  beginMeasure(): boolean {
    if (this.inFlight) return false;
    const gl = this.gl;
    let started = false;
    this.raw(() => {
      const un = this.uniforms;
      un.reduceFirst.textures.A = this.vel[this.cur].texture;
      un.reduceFirst.textures.B = this.vel[this.prev].texture;
      un.reduceFirst.ints.S[0] = this.w;
      un.reduceFirst.ints.S[1] = this.h;
      this.draw(this.programs.reduceFirst, this.reduce[0], un.reduceFirst);
      for (let i = 1; i < this.reduce.length; i++) {
        const src = this.reduce[i - 1];
        un.reduceNext.textures.A = src.texture;
        un.reduceNext.ints.S[0] = src.width;
        un.reduceNext.ints.S[1] = src.height;
        this.draw(this.programs.reduceNext, this.reduce[i], un.reduceNext);
      }
      un.encode.textures.A = this.reduce[this.reduce.length - 1].texture;
      this.draw(this.programs.encode, this.encoded, un.encode);
      const buffer = gl.createBuffer()!;
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, 4, gl.STREAM_READ);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.encoded.framebuffer);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, 0);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      if (!fence) { gl.deleteBuffer(buffer); return; }
      this.inFlight = { fence, buffer };
      started = true;
    });
    return started;
  }

  /** The result of the measure in flight once its fence has signaled, else null; call once per frame. */
  pollMeasure(): { du: number; u: number } | null {
    const flight = this.inFlight;
    if (!flight) return null;
    const gl = this.gl;
    const status = gl.clientWaitSync(flight.fence, 0, 0);
    if (status === gl.TIMEOUT_EXPIRED) return null;
    this.inFlight = null;
    gl.deleteSync(flight.fence);
    const bytes = new Uint8Array(4);
    if (status !== gl.WAIT_FAILED) {
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, flight.buffer);
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, bytes);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      this.renderer.resetState();
    }
    gl.deleteBuffer(flight.buffer);
    if (status === gl.WAIT_FAILED) return null;
    const u = (bytes[0] + bytes[1] / 255) / 255;
    const ratio = (bytes[2] + bytes[3] / 255) / 255;
    return { du: ratio * u, u };
  }

  dispose() {
    const gl = this.gl;
    if (this.inFlight) {
      gl.deleteSync(this.inFlight.fence);
      gl.deleteBuffer(this.inFlight.buffer);
      this.inFlight = null;
    }
    for (const t of [...this.vel, ...this.pres, this.div, ...this.reduce, this.encoded]) {
      gl.deleteTexture(t.texture);
      gl.deleteFramebuffer(t.framebuffer);
    }
    gl.deleteTexture(this.maskTex);
    gl.deleteTexture(this.fanTex);
    for (const p of Object.values(this.programs)) gl.deleteProgram(p.program);
    gl.deleteBuffer(this.quad);
    gl.deleteVertexArray(this.vao);
    for (const w of [...this.velWrap, this.maskWrap]) w.dispose();
  }
}
