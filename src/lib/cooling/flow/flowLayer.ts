import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, DataTexture, DoubleSide, FloatType, GLSL3,
  Mesh, NearestFilter, RGBAFormat, ShaderMaterial, Vector2, Vector3, type Group, type PerspectiveCamera, type WebGLRenderer,
} from 'three';
import { GlFlow, PassRunner, floatSupport, pass, target, type FloatKind } from './glFlow';
import { STUCK_AGE_RATE, STUCK_MOVE_CELLS, substepsFor, EMITTER_STRIDE, OUTSIDE_REACH_MM, drawnParticles, GRID_LOW_CELLS, GRID_TARGET_CELLS, PARTICLE_BIRTH_SPREAD, PARTICLE_LIFE_JITTER, PARTICLE_MAX_AGE, PARTICLE_SPEED_SCALE, HEAT_COUPLING, HEAT_COLOR_SPAN_C, STREAK_MIN_WIDTH_PX, STREAK_WIDTH_MM } from './flowParams';
import { NO_TEMPS, sourceRises, type ComponentTemps } from './heatModel';
import { buildCollisionShapes } from './collisionShapes';
import { SteadyGate } from './steadyGate';
import { buildFlowScene, type FlowInput, type FlowScene } from './gridScene';
import { FRAGMENT_OUT, PARTICLE_HEAT, PARTICLE_STATE, STREAK_FRAGMENT, STREAK_VERTEX } from './shaders';

/** Grid tiers by target cell count; a slow step drops one tier. */
export const FLOW_TIERS = [GRID_TARGET_CELLS, Math.round(GRID_TARGET_CELLS / 2), GRID_LOW_CELLS];
/** Fixed particle pool; a coarser grid tier draws a share of it. */
export const PARTICLE_TEXTURE = { w: 128, h: 84 };
const TIER_PARTICLE_SHARE = [1, 0.75, 0.5];
/** Particle states kept: the current one and the one before it, whose difference is the streak. */
const RING = 2;
const MAX_PARTICLES = PARTICLE_TEXTURE.w * PARTICLE_TEXTURE.h;
/** GPU time the solver may take per displayed frame. */
const SOLVER_BUDGET_MS = 8;
/** Per-frame cost the solver may take while the particles are still waiting for the first solve. */
const COLD_BUDGET_MS = 12;
/** Frames longer than this (ms) pull the step count down while no GPU time is known. */
const FRAME_SLOW_MS = 20;
const TIMER_EMA = 0.3;
const MAX_STEPS_PER_FRAME = 24;
const MIN_STEPS_PER_FRAME = 1;
const PARTICLE_SUBSTEPS = 2;
const STEADY_CHECK_EVERY = 16;
const STEADY_RATIO = 0.01;
const MAX_SOLVE_STEPS = 1500;
const SLOW_FRAME_MS = 30;
const SLOW_FRAMES = 24;
/** Peak alpha of a streak's head. */
const STREAK_ALPHA = 0.78;

export interface FlowColors {
  cool: Color;
  warm: Color;
  hot: Color;
  /** Collision shapes: solid obstacles and porous ones. */
  collision: Color;
  porous: Color;
}

export interface FlowOptions {
  particles: boolean;
  /** Draws the obstacles the solver rasterizes, as shapes, in place of the case model. */
  collisions: boolean;
  /** Visual time scale of the particles; the solve and the per-fan ratios are unchanged. */
  speed: number;
}

/** The airflow layer of the case view: solver, particles and the collision shapes, all on the renderer's own context. */
export class FlowLayer {
  readonly supported: boolean;
  private readonly kind: FloatKind | null;
  private readonly runner: PassRunner | null;
  private readonly group: Group;
  private input: FlowInput | null = null;
  private tier = 0;
  private flow: GlFlow | null = null;
  private fscene: FlowScene | null = null;
  private stepsSinceEdit = 0;
  private solving = false;
  private stepsPerFrame = 4;
  private slowCount = 0;
  private lastFrameAt = 0;
  private options: FlowOptions = { particles: true, collisions: false, speed: PARTICLE_SPEED_SCALE };
  private seed = 1;
  private temps: ComponentTemps = NO_TEMPS;
  private coldStart = false;
  private readonly gate = new SteadyGate();
  private readonly timer: { ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }; pending: { q: WebGLQuery; steps: number }[]; msPerStep: number } | null;

  private stateTargets: ReturnType<typeof target>[] = [];
  private heatTargets: ReturnType<typeof target>[] = [];
  private stateCur = 0;
  private stateMat: ShaderMaterial | null = null;
  private heatMat: ShaderMaterial | null = null;
  private spawnTex: DataTexture | null = null;
  private streaks: Mesh | null = null;
  private streakMat: ShaderMaterial | null = null;
  private collisionsShown = false;
  private collisions: { group: Group; dispose: () => void } | null = null;

  private readonly renderer: WebGLRenderer;
  private readonly extent: Vector3;
  private readonly colors: FlowColors;

  constructor(renderer: WebGLRenderer, host: Group, extent: Vector3, colors: FlowColors) {
    this.renderer = renderer;
    this.extent = extent;
    this.colors = colors;
    this.kind = floatSupport(renderer);
    // Particle positions need 32-bit float targets: half floats stall slow particles, so a half-only context gets no layer.
    this.supported = this.kind === FloatType;
    this.runner = this.supported ? new PassRunner(renderer) : null;
    const ext = this.supported ? (renderer.getContext() as WebGL2RenderingContext).getExtension('EXT_disjoint_timer_query_webgl2') : null;
    this.timer = ext ? { ext, pending: [], msPerStep: 0 } : null;
    this.group = host;
  }

  /** The grid tier in use, 0 being the finest. */
  get currentTier(): number {
    return this.tier;
  }

  /** How the solver's step count is paced: from GPU timer queries when the context has them, else from frame times. */
  get timingMode(): 'gpu-timer' | 'frame-delta' {
    return this.timer ? 'gpu-timer' : 'frame-delta';
  }

  /** True once the solver has found the steady field and stopped stepping. */
  get settled(): boolean {
    return !!this.fscene && !this.solving;
  }

  /** Whether the layer still has something to animate: a solve in progress, or particles drawn. */
  get active(): boolean {
    return this.supported && !!this.fscene && (this.solving || this.options.particles);
  }

  setOptions(options: FlowOptions) {
    this.options = options;
    for (const m of [this.stateMat, this.heatMat]) if (m) { m.uniforms.uSpeed.value = options.speed; m.uniforms.uSubsteps.value = substepsFor(options.speed); }
    if (this.streaks) {
      this.streaks.visible = options.particles;
    }
    if (options.collisions !== this.collisionsShown) this.syncCollisions();
  }

  /** New part temperatures: only the heat pass's uniforms change, so the solver, the grid and every particle carry on. */
  setTemps(temps: ComponentTemps) {
    this.temps = temps;
    this.applyTemps();
  }

  private applyTemps() {
    if (!this.heatMat) return;
    const [, gpu, cpu] = sourceRises(this.temps);
    (this.heatMat.uniforms.uSrc.value as Vector3).set(0, gpu, cpu);
  }

  /** New edit: rebuilds the voxel scene and re-solves from the current field. Null clears the layer. */
  setInput(input: FlowInput | null) {
    this.input = input;
    if (!this.supported) return;
    if (!input) { this.teardown(); return; }
    this.build(true);
  }

  private build(warm: boolean) {
    if (!this.input || !this.kind || !this.runner) return;
    const scene = buildFlowScene(this.input, FLOW_TIERS[this.tier]);
    const sameGrid = !!this.flow && !!this.fscene && this.fscene.dims.every((d, i) => d === scene.dims[i]);
    if (this.flow && sameGrid && warm) {
      this.flow.setScene(scene);
    } else {
      this.flow?.dispose();
      this.flow = new GlFlow(this.renderer, scene, this.kind);
      this.ensureParticles();
      this.resetParticles();
      this.coldStart = true;
    }
    this.fscene = scene;
    if (this.collisionsShown) this.syncCollisions(true);
    this.uploadSpawns(scene);
    this.updateUniforms();
    this.stepsSinceEdit = 0;
    this.gate.invalidate();
    this.solving = scene.fanCount > 0;
  }

  private uploadSpawns(scene: FlowScene) {
    const entries = scene.emitters.length / EMITTER_STRIDE;
    const data = new Float32Array(Math.max(1, entries) * EMITTER_STRIDE);
    data.set(scene.emitters);
    this.spawnTex?.dispose();
    this.spawnTex = new DataTexture(data, Math.max(1, entries) * (EMITTER_STRIDE / 4), 1, RGBAFormat, FloatType);
    this.spawnTex.minFilter = NearestFilter;
    this.spawnTex.magFilter = NearestFilter;
    this.spawnTex.needsUpdate = true;
    if (this.stateMat) { this.stateMat.uniforms.EM.value = this.spawnTex; this.stateMat.uniforms.uEmitterCount.value = entries; this.stateMat.uniforms.uBoundsMin.value = scene.particleBounds.min; this.stateMat.uniforms.uBoundsMax.value = scene.particleBounds.max; }
  }

  private ensureParticles() {
    if (!this.kind || this.stateMat) return;
    const { w, h } = PARTICLE_TEXTURE;
    this.stateTargets = Array.from({ length: RING }, () => target(w, h, this.kind!));
    this.heatTargets = Array.from({ length: RING }, () => target(w, h, this.kind!));
    const base = () => ({
      uN: { value: new Vector3() }, uTX: { value: 1 }, M: { value: null as unknown }, U: { value: null as unknown },
      PA: { value: null as unknown }, EM: { value: null as unknown }, uEmitterCount: { value: 0 }, uBoundsMin: { value: [0, 0, 0] }, uBoundsMax: { value: [0, 0, 0] }, uStuckMove: { value: STUCK_MOVE_CELLS }, uStuckRate: { value: STUCK_AGE_RATE }, uSeed: { value: 0 }, uMaxAge: { value: PARTICLE_MAX_AGE }, uBirthSpread: { value: PARTICLE_BIRTH_SPREAD }, uLifeJitter: { value: PARTICLE_LIFE_JITTER }, uSpeed: { value: this.options.speed }, uSubsteps: { value: substepsFor(this.options.speed) },
    });
    this.stateMat = pass(PARTICLE_STATE, base());
    this.heatMat = pass(PARTICLE_HEAT, { ...base(), PB: { value: null as unknown }, uSrc: { value: new Vector3(0, -1, -1) }, uCoupling: { value: HEAT_COUPLING } });
    this.applyTemps();

    const geometry = new BufferGeometry();
    // Four vertices per particle: tail and head, each on both sides of the line.
    const refs = new Float32Array(w * h * 4 * 2);
    const corners = new Float32Array(w * h * 4 * 2);
    const index = new Uint32Array(w * h * 6);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = y * w + x;
      for (let c = 0; c < 4; c++) {
        refs[(n * 4 + c) * 2] = x; refs[(n * 4 + c) * 2 + 1] = y;
        corners[(n * 4 + c) * 2] = c >> 1; corners[(n * 4 + c) * 2 + 1] = c & 1 ? 1 : -1;
      }
      index.set([n * 4, n * 4 + 1, n * 4 + 2, n * 4 + 1, n * 4 + 3, n * 4 + 2], n * 6);
    }
    geometry.setAttribute('ref', new BufferAttribute(refs, 2));
    geometry.setAttribute('corner', new BufferAttribute(corners, 2));
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(w * h * 4 * 3), 3));
    geometry.setIndex(new BufferAttribute(index, 1));
    geometry.setDrawRange(0, drawnParticles(MAX_PARTICLES, TIER_PARTICLE_SHARE[this.tier]) * 6);
    this.streakMat = new ShaderMaterial({
      glslVersion: GLSL3, vertexShader: STREAK_VERTEX, fragmentShader: STREAK_FRAGMENT,
      uniforms: {
        PA: { value: null as unknown }, PP: { value: null as unknown }, PB: { value: null as unknown }, uCell: { value: 1 }, uOrigin: { value: new Vector3() }, uCaseExtent: { value: this.extent.clone() },
        uMargin: { value: OUTSIDE_REACH_MM }, uWidthMm: { value: STREAK_WIDTH_MM }, uMinWidthPx: { value: STREAK_MIN_WIDTH_PX }, uViewport: { value: new Vector2(1, 1) }, uScale: { value: 400 },
        uMaxAge: { value: PARTICLE_MAX_AGE }, uLifeJitter: { value: PARTICLE_LIFE_JITTER }, uAlpha: { value: STREAK_ALPHA },
        uCool: { value: this.colors.cool }, uWarm: { value: this.colors.warm }, uHot: { value: this.colors.hot }, uHeatSpan: { value: HEAT_COLOR_SPAN_C },
      },
      transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending, side: DoubleSide,
    });
    this.streaks = new Mesh(geometry, this.streakMat);
    this.streaks.frustumCulled = false;
    this.streaks.renderOrder = 6;
    this.group.add(this.streaks);
  }

  /** Every particle starts over: positions are in cell coordinates, which mean something else on a new grid. */
  private resetParticles() {
    if (!this.kind || !this.runner || this.stateTargets.length === 0) return;
    const { w, h } = PARTICLE_TEXTURE;
    const fill = new Float32Array(w * h * 4);
    for (let i = 0; i < w * h; i++) fill[i * 4 + 3] = PARTICLE_MAX_AGE * 5;
    const init = new DataTexture(fill, w, h, RGBAFormat, FloatType);
    init.needsUpdate = true;
    const blit = pass(FRAGMENT_OUT + 'uniform sampler2D T; void main(){ gl_FragColor = texelFetch(T, ivec2(gl_FragCoord.xy), 0); }', { T: { value: init } });
    const zero = pass(FRAGMENT_OUT + 'void main(){ gl_FragColor = vec4(0.0); }', {});
    for (let i = 0; i < RING; i++) { this.runner.run(blit, this.stateTargets[i]); this.runner.run(zero, this.heatTargets[i]); }
    blit.dispose();
    zero.dispose();
    init.dispose();
    this.stateCur = 0;
  }

  /** Rebuilds the scene one grid tier coarser. */
  dropTier() {
    if (this.tier >= FLOW_TIERS.length - 1) return;
    this.tier++;
    this.streaks?.geometry.setDrawRange(0, drawnParticles(MAX_PARTICLES, TIER_PARTICLE_SHARE[this.tier]) * 6);
    this.slowCount = 0;
    this.build(false);
  }

  private updateUniforms() {
    const flow = this.flow;
    const scene = this.fscene;
    if (!flow || !scene) return;
    const n = new Vector3(...scene.dims);
    const origin = new Vector3(...scene.origin);
    for (const m of [this.stateMat, this.heatMat]) {
      if (!m) continue;
      (m.uniforms.uN.value as Vector3).copy(n);
      m.uniforms.uTX.value = flow.tx;
      m.uniforms.M.value = flow.maskTexture;
    }
    if (this.stateMat) this.stateMat.uniforms.F = { value: flow.fanTexture };
    for (const m of [this.streakMat]) {
      if (!m) continue;
      m.uniforms.uCell.value = scene.cellMm;
      (m.uniforms.uOrigin.value as Vector3).copy(origin);
    }
  }

  /** Runs the solver and particle passes for one displayed frame. Call before rendering the scene. */
  frame(now: number, camera: PerspectiveCamera, viewportHeight: number) {
    const flow = this.flow;
    const scene = this.fscene;
    if (!this.supported || !flow || !scene || !this.runner) return;
    const dt = this.lastFrameAt ? now - this.lastFrameAt : 0;
    this.lastFrameAt = now;

    const wantsFlow = this.options.particles;
    this.pollSteady(flow);
    if (this.solving && wantsFlow) {
      this.pollTimer();
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      const timed = this.timer && this.timer.pending.length < 4 ? gl.createQuery() : null;
      if (timed) gl.beginQuery(this.timer!.ext.TIME_ELAPSED_EXT, timed);
      const start = performance.now();
      const n = this.stepsPerFrame;
      flow.step(n);
      const before = this.stepsSinceEdit;
      this.stepsSinceEdit += n;
      const spent = performance.now() - start;
      if (timed) {
        gl.endQuery(this.timer!.ext.TIME_ELAPSED_EXT);
        this.timer!.pending.push({ q: timed, steps: n });
      }
      // Outside the timed span: a PBO read inside an active query is an invalid operation.
      if (Math.floor(this.stepsSinceEdit / STEADY_CHECK_EVERY) > Math.floor(before / STEADY_CHECK_EVERY)) this.checkSteady(flow);
      this.paceSteps(dt, spent / n);
      this.slowCount = dt > SLOW_FRAME_MS ? this.slowCount + 1 : Math.max(0, this.slowCount - 1);
      if (this.slowCount >= SLOW_FRAMES && this.tier < FLOW_TIERS.length - 1 && this.stepsPerFrame <= MIN_STEPS_PER_FRAME + 1) {
        this.dropTier();
        return;
      }
    }
    if (!this.solving) this.coldStart = false;
    // Particles wait for the first solve: with no velocity yet they would sit on their spawn points.
    if (this.options.particles && !(this.coldStart && this.solving) && this.stateMat && this.heatMat && this.streaks && this.spawnTex) {
      for (let st = 0; st < PARTICLE_SUBSTEPS; st++) {
        const next = (this.stateCur + 1) % RING;
        this.stateMat.uniforms.U.value = flow.velocity;
        this.stateMat.uniforms.PA.value = this.stateTargets[this.stateCur].texture;
        this.stateMat.uniforms.uSeed.value = (this.seed = (this.seed + 1) % 9973) * 0.137;
        this.runner.run(this.stateMat, this.stateTargets[next]);
        this.heatMat.uniforms.PA.value = this.stateTargets[next].texture;
        this.heatMat.uniforms.PB.value = this.heatTargets[this.stateCur].texture;
        this.runner.run(this.heatMat, this.heatTargets[next]);
        this.stateCur = next;
      }
      const scale = viewportHeight / (2 * Math.tan((camera.fov * Math.PI) / 360));
      const u = this.streakMat!.uniforms;
      u.PA.value = this.stateTargets[this.stateCur].texture;
      u.PP.value = this.stateTargets[(this.stateCur + RING - 1) % RING].texture;
      u.PB.value = this.heatTargets[this.stateCur].texture;
      u.uScale.value = scale;
      (u.uViewport.value as Vector2).set(viewportHeight * camera.aspect, viewportHeight);
    }
  }

  // Collects finished GPU timer queries, oldest first; a disjoint result is dropped.
  private pollTimer() {
    const t = this.timer;
    if (!t) return;
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    while (t.pending.length > 0) {
      const { q, steps } = t.pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const disjoint = gl.getParameter(t.ext.GPU_DISJOINT_EXT);
      if (!disjoint) {
        const ms = (gl.getQueryParameter(q, gl.QUERY_RESULT) as number) / 1e6 / Math.max(1, steps);
        t.msPerStep = t.msPerStep === 0 ? ms : t.msPerStep * (1 - TIMER_EMA) + ms * TIMER_EMA;
      }
      gl.deleteQuery(q);
      t.pending.shift();
    }
  }

  // Sets the steps run per frame from what a step costs: the larger of its CPU submit time and its GPU time (timer query, else frame deltas), within the frame budget.
  private paceSteps(dt: number, cpuMsPerStep: number) {
    const budget = this.coldStart ? COLD_BUDGET_MS : SOLVER_BUDGET_MS;
    const t = this.timer;
    const gpu = t && t.msPerStep > 0 ? t.msPerStep : 0;
    const cpuCap = Math.floor(budget / Math.max(cpuMsPerStep, 0.05));
    let next: number;
    if (gpu > 0) {
      next = Math.min(cpuCap, Math.floor(budget / gpu), this.stepsPerFrame + 3);
    } else {
      // No GPU time yet: grow one step a frame while frames stay short, back off at once when they do not.
      next = Math.min(cpuCap, dt > 0 && dt < FRAME_SLOW_MS ? this.stepsPerFrame + 1 : this.stepsPerFrame - 2);
    }
    this.stepsPerFrame = Math.min(MAX_STEPS_PER_FRAME, Math.max(MIN_STEPS_PER_FRAME, next));
  }

  // Starts a steady check; its result is read in a later frame, so no frame waits on it.
  private checkSteady(flow: GlFlow) {
    if (flow.beginMeasure()) this.gate.begin();
  }

  // Applies a finished steady check to the solve.
  private pollSteady(flow: GlFlow) {
    const r = flow.pollMeasure();
    if (!r) return;
    if (this.gate.settles(r.du, r.u, STEADY_RATIO) || this.stepsSinceEdit >= MAX_SOLVE_STEPS) this.solving = false;
  }

  /** Particle positions (cell coordinates) and heat read back from the GPU; for checks that none sit in a solid cell. */
  readParticles(): { pos: Float32Array; heat: Float32Array } {
    const { w, h } = PARTICLE_TEXTURE;
    const pos = new Float32Array(w * h * 4);
    const heat = new Float32Array(w * h * 4);
    this.renderer.readRenderTargetPixels(this.stateTargets[this.stateCur], 0, 0, w, h, pos);
    this.renderer.readRenderTargetPixels(this.heatTargets[this.stateCur], 0, 0, w, h, heat);
    return { pos, heat };
  }

  get scene(): FlowScene | null {
    return this.fscene;
  }

  // Rebuilds the collision shapes from the scene's own obstacle list; `force` redraws for a new scene.
  private syncCollisions(force = false) {
    if (this.collisions) { this.group.remove(this.collisions.group); this.collisions.dispose(); this.collisions = null; }
    this.collisionsShown = this.options.collisions;
    const scene = this.fscene;
    if (!this.collisionsShown || !scene) { if (force) this.collisionsShown = this.options.collisions; return; }
    this.collisions = buildCollisionShapes(scene.obstacles, this.colors.collision, this.colors.porous);
    this.collisions.group.renderOrder = 1;
    this.group.add(this.collisions.group);
  }

  private teardown() {
    if (this.collisions) { this.group.remove(this.collisions.group); this.collisions.dispose(); this.collisions = null; }
    this.flow?.dispose();
    this.flow = null;
    this.fscene = null;
    this.solving = false;
    if (this.streaks) this.streaks.visible = false;
  }

  dispose() {
    this.teardown();
    for (const t of [...this.stateTargets, ...this.heatTargets]) t.dispose();
    for (const m of [this.stateMat, this.heatMat, this.streakMat]) m?.dispose();
    this.spawnTex?.dispose();
    this.streaks?.geometry.dispose();
    if (this.streaks) this.group.remove(this.streaks);
    if (this.timer) for (const { q } of this.timer.pending) (this.renderer.getContext() as WebGL2RenderingContext).deleteQuery(q);
    this.runner?.dispose();
    this.stateMat = null;
  }
}
