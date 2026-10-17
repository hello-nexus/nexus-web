import { sensorSweep, type SensorSignal, type SensorUniform } from '../../../../lib/sensorBinding';
import { recipeUsesWheel } from '../../../../lib/studioWheel';
import { compileStudio, type StudioRecipe } from './studioCompiler';
import { syntheticAudio } from './syntheticAudio';

// Many previews share ONE WebGL2 context: Chromium caps live contexts per page
// and evicts the oldest, so a grid of per-card contexts would black out cards
// (and possibly the lighting page's own canvas). Each frame renders every
// visible preview into the shared canvas and copies it to the card's 2D canvas.

const QUAD_VERT = `#version 300 es
layout (location = 0) in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

/** Frame rate for grids of animated effect previews (Marketplace, downloads, Studio variations). */
export const GALLERY_FPS = 20;
const FRAME_MS = 1000 / GALLERY_FPS;
const MAX_DPR = 1.5;
const PROGRAM_CACHE = 48;
const NEUTRAL: Record<string, number> = { u_speed: 1, u_hue: 0, u_colorize: 0, u_saturation: 1, u_contrast: 1 };

interface Program {
  prog: WebGLProgram;
  locs: Map<string, WebGLUniformLocation>;
}

interface Entry {
  canvas: HTMLCanvasElement;
  frag: string;
  params: Record<string, number>;
  sensors: SensorUniform[];
  /** The wheel state of a wheel-colored recipe, which the baked shader leaves to the effect state. */
  wheel: Record<string, number>;
  visible: boolean;
  failed: boolean;
  drawn: boolean;
}

// Where the previews read live sensor values while an editor provides them; without one a sensor swings on its own.
const sensorFeeds = new Set<React.RefObject<SensorSignal | null>>();
let sensorFeed: React.RefObject<SensorSignal | null> | null = null;

/** The feed the previews read now; null while none is registered. */
export const activePreviewSensorFeed = () => sensorFeed;

/** Offers a source of sensor readings to every preview; the newest one still registered is read. Returns the unregister. */
export function registerPreviewSensorFeed(feed: React.RefObject<SensorSignal | null>): () => void {
  sensorFeeds.add(feed);
  sensorFeed = feed;
  return () => {
    sensorFeeds.delete(feed);
    if (sensorFeed === feed) sensorFeed = [...sensorFeeds].at(-1) ?? null;
  };
}

// A sensor-fed still holds a filled-in level rather than the empty start of the sweep.
const STILL_SENSOR_LEVEL = 0.65;

const entries = new Set<Entry>();
const byCanvas = new WeakMap<Element, Entry>();
const programs = new Map<string, Program | null>();
let glCanvas: HTMLCanvasElement | null = null;
let gl: WebGL2RenderingContext | null = null;
let ready = false;
let raf = 0;
let lastFrame = 0;
let observer: IntersectionObserver | null = null;

function context(): WebGL2RenderingContext | null {
  if (!glCanvas) {
    glCanvas = document.createElement('canvas');
    glCanvas.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      programs.clear();
      ready = false;
      for (const entry of entries) entry.failed = false;
    });
    gl = glCanvas.getContext('webgl2', { antialias: false, alpha: false });
  }
  if (!gl || gl.isContextLost()) return null;
  if (!ready) {
    gl.bindVertexArray(gl.createVertexArray());
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    ready = true;
  }
  return gl;
}

function compile(g: WebGL2RenderingContext, frag: string): Program | null {
  if (programs.has(frag)) {
    const cached = programs.get(frag)!;
    programs.delete(frag);
    programs.set(frag, cached);
    return cached;
  }
  const shader = (type: number, src: string) => {
    const s = g.createShader(type)!;
    g.shaderSource(s, src);
    g.compileShader(s);
    return s;
  };
  const vs = shader(g.VERTEX_SHADER, QUAD_VERT);
  const fs = shader(g.FRAGMENT_SHADER, frag.replace('#version 330 core', '#version 300 es\nprecision highp float;'));
  const prog = g.createProgram()!;
  g.attachShader(prog, vs);
  g.attachShader(prog, fs);
  g.linkProgram(prog);
  g.deleteShader(vs);
  g.deleteShader(fs);
  let result: Program | null = null;
  if (g.getProgramParameter(prog, g.LINK_STATUS)) {
    const locs = new Map<string, WebGLUniformLocation>();
    const count = g.getProgramParameter(prog, g.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < count; i++) {
      const name = g.getActiveUniform(prog, i)?.name;
      const loc = name ? g.getUniformLocation(prog, name) : null;
      if (name && loc) locs.set(name, loc);
    }
    result = { prog, locs };
  } else {
    g.deleteProgram(prog);
  }
  programs.set(frag, result);
  while (programs.size > PROGRAM_CACHE) {
    const [oldest, p] = programs.entries().next().value!;
    if (p) g.deleteProgram(p.prog);
    programs.delete(oldest);
  }
  return result;
}

/** The stand-in music as uniforms, so audio-reactive effects move in a preview without capturing audio. */
function audioUniforms(t: number): { scalars: Record<string, number>; spectrum: number[] } {
  const a = syntheticAudio(t);
  return {
    scalars: { u_audioBeat: a.beat, u_audioBass: a.bass, u_audioMid: a.mid, u_audioHigh: a.high, u_audioLevel: a.level },
    spectrum: a.spectrum,
  };
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function draw(ts: number) {
  raf = 0;
  if (entries.size === 0) return;
  raf = requestAnimationFrame(draw);
  if (ts - lastFrame < FRAME_MS) return;
  lastFrame = ts;
  const g = context();
  if (!g || !glCanvas) return;
  const still = reducedMotion();
  const t = still ? 12 : (Date.now() % 86_400_000) / 1000;
  const audio = audioUniforms(t);
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  for (const e of entries) {
    if (!e.visible || e.failed || (still && e.drawn)) continue;
    const w = Math.max(1, Math.round(e.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(e.canvas.clientHeight * dpr));
    const program = compile(g, e.frag);
    if (!program) { e.failed = true; continue; }
    if (glCanvas.width < w) glCanvas.width = w;
    if (glCanvas.height < h) glCanvas.height = h;
    if (e.canvas.width !== w || e.canvas.height !== h) { e.canvas.width = w; e.canvas.height = h; }
    g.viewport(0, 0, w, h);
    g.useProgram(program.prog);
    for (const [name, loc] of program.locs) {
      if (name === 'u_resolution') g.uniform2f(loc, w, h);
      else if (name === 'u_time') g.uniform1f(loc, t);
      // An array uniform is listed by its first element's name.
      else if (name === 'u_spectrum[0]') g.uniform1fv(loc, audio.spectrum);
      else {
        const sensor = e.sensors.find(s => s.name === name);
        g.uniform1f(loc, e.params[name] ?? e.wheel[name] ?? NEUTRAL[name] ?? audio.scalars[name]
          ?? (sensor ? (sensorFeed?.current?.(sensor.binding) ?? sensorSweep(t)) : 0));
      }
    }
    g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
    // GL rows start at the bottom of the drawing buffer; the copy reads the top-left-origin image.
    e.canvas.getContext('2d')?.drawImage(glCanvas, 0, glCanvas.height - h, w, h, 0, 0, w, h);
    e.drawn = true;
  }
}

function watch(): IntersectionObserver | null {
  if (observer || typeof IntersectionObserver !== 'function') return observer;
  observer = new IntersectionObserver(records => {
    for (const r of records) {
      const e = byCanvas.get(r.target);
      if (e) e.visible = r.isIntersecting;
    }
  });
  return observer;
}

// The service's thumbnail size and frame time (LightingProvider.CaptureAnimateThumbnail).
const STILL_W = 160;
const STILL_H = 90;
const STILL_TIME_S = 0.957;

/** One frame of `recipe` as the service renders a custom effect's thumbnail, as a data URL; null without WebGL2 or when it fails to compile. */
export function renderRecipeStill(recipe: StudioRecipe): string | null {
  const g = context();
  if (!g || !glCanvas) return null;
  // Unbaked, so a knob edit reuses the linked program: the shader multiplies
  // (adds, for hue) these uniforms with its neutral base constants.
  const { frag, params, sensors } = compileStudio(recipe);
  const base: Record<string, number> = {
    u_speed: recipe.speed / 50, u_hue: recipe.hue, u_saturation: recipe.saturation, u_contrast: recipe.contrast,
    ...(recipeUsesWheel(recipe) ? { u_colorize: recipe.colorize ?? 0 } : {}),
  };
  const program = compile(g, frag);
  if (!program) return null;
  if (glCanvas.width < STILL_W) glCanvas.width = STILL_W;
  if (glCanvas.height < STILL_H) glCanvas.height = STILL_H;
  g.viewport(0, 0, STILL_W, STILL_H);
  g.useProgram(program.prog);
  for (const [name, loc] of program.locs) {
    if (name === 'u_resolution') g.uniform2f(loc, STILL_W, STILL_H);
    else if (name === 'u_time') g.uniform1f(loc, STILL_TIME_S);
    else g.uniform1f(loc, params[name] ?? base[name] ?? NEUTRAL[name] ?? (sensors.some(s => s.name === name) ? STILL_SENSOR_LEVEL : 0));
  }
  g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
  const out = document.createElement('canvas');
  out.width = STILL_W;
  out.height = STILL_H;
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(glCanvas, 0, glCanvas.height - STILL_H, STILL_W, STILL_H, 0, 0, STILL_W, STILL_H);
  return out.toDataURL();
}

/** Animates `recipe` into `canvas` until the returned detach runs. */
export function attachRecipePreview(canvas: HTMLCanvasElement, recipe: StudioRecipe): () => void {
  const { frag, params, sensors } = compileStudio(recipe, { bake: true });
  const obs = watch();
  const wheel: Record<string, number> = recipeUsesWheel(recipe) ? { u_hue: recipe.hue, u_colorize: recipe.colorize ?? 0 } : {};
  const entry: Entry = { canvas, frag, params, sensors, wheel, visible: !obs, failed: false, drawn: false };
  entries.add(entry);
  byCanvas.set(canvas, entry);
  obs?.observe(canvas);
  if (!raf) raf = requestAnimationFrame(draw);
  return () => {
    entries.delete(entry);
    obs?.unobserve(canvas);
    byCanvas.delete(canvas);
  };
}
