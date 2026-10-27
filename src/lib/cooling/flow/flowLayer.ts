import {
  NormalBlending, BufferAttribute, BufferGeometry, Color, DataTexture, DoubleSide, FloatType, GLSL3,
  Mesh, NearestFilter, RGBAFormat, ShaderMaterial, Vector2, Vector3, type Group, type PerspectiveCamera, type WebGLRenderer,
} from 'three';
import { DEV_TOOLS } from '../../devTools';
import { isGpuSlotKey } from '../slotFlow';
import { buildGridView, type GridView } from './gridView';
import { PARTICLE_STEPS_PER_SECOND, ParticleClock } from './particleClock';
import { GlFlow, PassRunner, floatSupport, pass, target, type FloatKind } from './glFlow';
import { STUCK_AGE_RATE, STUCK_MOVE_CELLS, substepsFor, EMITTER_STRIDE, OUTSIDE_REACH_MM, drawnParticles, GRID_LOW_CELLS, GRID_TARGET_CELLS, PARTICLE_BIRTH_SPREAD, PARTICLE_LIFE_JITTER, PARTICLE_MAX_AGE, PARTICLE_REFERENCE_SPEED, PARTICLE_SPEED_SCALE, HEAT_COLOR_SPAN_C, HEAT_SPAN_MAX_K, HEAT_SPAN_MIN_K, HEAT_SPAN_PER_EXHAUST_RISE, POWER_RESUME_DELTA_W, STREAK_MIN_WIDTH_PX, STREAK_SEGMENTS, STREAK_TAIL_WIDTH, STREAK_WIDTH_MM, TEMP_RESUME_DELTA_K, TEMP_SETTLE_STEPS } from './flowParams';
import { NO_TEMPS, exhaustRiseK, sourceRises, sourceWatts, type ComponentTemps } from './heatModel';
import { buildCollisionShapes } from './collisionShapes';
import { SteadyGate } from './steadyGate';
import { SOURCE_CPU, SOURCE_GPU, buildFlowScene, type FlowInput, type FlowScene } from './gridScene';
import { FRAGMENT_OUT, PARTICLE_HEAT, PARTICLE_STATE, STREAK_FRAGMENT, STREAK_VERTEX } from './shaders';

/** The grid sizes by tier, each target cell count; a slow step drops one tier. A dev-tools build may set `nexus.dev.flowCells` in local storage to try another density. */
export const flowTiers = (): number[] => {
  let cells = GRID_TARGET_CELLS;
  if (DEV_TOOLS) {
    try { cells = Number(localStorage.getItem('nexus.dev.flowCells')) || cells; } catch { /* storage unavailable */ }
  }
  return [cells, Math.round(cells / 2), GRID_LOW_CELLS];
};
/** Fixed particle pool; a coarser grid tier draws a share of it. */
export const PARTICLE_TEXTURE = { w: 128, h: 84 };
const TIER_PARTICLE_SHARE = [1, 0.75, 0.5];
/** Particle states kept: the current one and the one before it, whose difference is the streak. */
const RING = 2;
const MAX_PARTICLES = PARTICLE_TEXTURE.w * PARTICLE_TEXTURE.h;
/** GPU time the solver may take per displayed frame. */
const SOLVER_BUDGET_MS = 8;
/** Per-frame cost the solver may take while the particles are still waiting for their first solver steps. */
const COLD_BUDGET_MS = 12;
/** Solver steps a fresh field runs before the particles start: the fans' own cells drive them from the first step, so the air need not be steady first. */
const COLD_PARTICLE_STEPS = 120;
/** Frames longer than this (ms) pull the step count down while no GPU time is known. */
const FRAME_SLOW_MS = 20;
const TIMER_EMA = 0.3;
const MAX_STEPS_PER_FRAME = 12;
const MIN_STEPS_PER_FRAME = 1;
const STEADY_CHECK_EVERY = 16;
const STEADY_RATIO = 0.01;
const MAX_SOLVE_STEPS = 1500;
const SLOW_FRAME_MS = 30;
const SLOW_FRAMES = 24;
/** Peak alpha of a streak's head. */
const STREAK_ALPHA = 0.95;
/** A speed change re-solves only when the fans' speed mix has drifted this far from the solved one, and at most this often. */
const RESOLVE_DRIFT = 0.3;
const RESOLVE_MIN_INTERVAL_MS = 60000;
/** The drawn particle speed follows the fans' mean speed within these bounds of the solved one. */
const SPEED_FACTOR_MIN = 0.2;
const SPEED_FACTOR_MAX = 3;

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
  /** Dev tools: draws the grid cells and how they are used. */
  grid?: boolean;
  /** Screen speed over real speed: below one is slow motion. When set, the particle speed comes from it and the scene's own step length, so the flow reads at this slow motion whatever the case size; `speed` then only serves a layer given no scale. */
  timeScale?: number;
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
  private readonly tiers = flowTiers();
  private readonly clock = new ParticleClock();
  private solveStartedAt = 0;
  private stepsSinceEdit = 0;
  private solving = false;
  private stepsPerFrame = 4;
  private slowCount = 0;
  private lastFrameAt = 0;
  private options: FlowOptions = { particles: true, collisions: false, speed: PARTICLE_SPEED_SCALE };
  private seed = 1;
  private temps: ComponentTemps = NO_TEMPS;
  /** Source temperatures the solve was last woken at, and whether the scene has any heat cell to care about them. */
  private wakeRises: number[] = [];
  private wakeWatts: number[] = [];
  /** The input the field was solved for, and when: later speed changes only scale the drawn particle speed. */
  private solvedInput: FlowInput | null = null;
  private solvedAt = 0;
  private speedFactor = 1;
  /** A speed mix drifted past the limit inside the minimum interval: solve again once it has passed. */
  private resolveDue = false;
  /** Temperature-only passes still owed after a settle or a part's temperature move: the velocity stays frozen. */
  private tempStepsLeft = 0;
  private heatCells = false;
  private coldStart = false;
  private coldSteps = 0;
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
  private gridView: GridView | null = null;
  private gridShown = false;
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

  // Particle speed in cells per particle step: the options' time scale over the scene's own step (real seconds per solver step) at the fixed particle step rate, times the fans' mean speed change since the solve.
  private drawnSpeed(): number {
    const scale = this.options.timeScale;
    const base = scale !== undefined && this.fscene ? scale / (PARTICLE_STEPS_PER_SECOND * this.fscene.stepSeconds) : this.options.speed;
    return base * this.speedFactor;
  }

  setOptions(options: FlowOptions) {
    this.options = options;
    for (const m of [this.stateMat, this.heatMat]) if (m) { m.uniforms.uSpeed.value = this.drawnSpeed(); m.uniforms.uSubsteps.value = substepsFor(this.drawnSpeed()); }
    if (this.streaks) {
      this.streaks.visible = options.particles;
    }
    if (options.collisions !== this.collisionsShown) this.syncCollisions();
    if (!!options.grid !== this.gridShown) this.syncGrid();
  }

  /** New part temperatures: only the temperature pass's uniforms change, so the grid and every particle carry on. A settled solve wakes again when a part has moved enough. */
  setTemps(temps: ComponentTemps) {
    this.temps = temps;
    this.applyTemps();
    this.updateSpan();
  }

  private applyTemps() {
    const flow = this.flow;
    const scene = this.fscene;
    if (!flow || !scene) return;
    const wasHot = flow.hot;
    flow.setTemps(this.temps);
    // With no fan moving air, a hot part's plume particles start only while it is hot.
    if (wasHot !== flow.hot) this.uploadSpawns(scene);
    if (!this.heatCells) return;
    const rises = sourceRises(this.temps);
    const watts = sourceWatts(this.temps);
    // A reading that appears, vanishes or moves far enough counts, so the field never stays frozen on a stale source.
    const moved = rises.some((r, i) => Math.abs(r - (this.wakeRises[i] ?? -1)) >= TEMP_RESUME_DELTA_K) || watts.some((w, i) => (w >= 0) !== ((this.wakeWatts[i] ?? -1) >= 0) || (w >= 0 && Math.abs(w - this.wakeWatts[i]) >= POWER_RESUME_DELTA_W));
    // With no fan, buoyancy is the only driver, so a part's temperature moving re-solves the velocity. Otherwise a temperature change never does: only the cheap temperature pass runs, on the frozen velocity.
    if (scene.fanCount === 0 && (moved || wasHot !== flow.hot)) { this.wakeWatts = watts; this.wake(rises); }
    else if (moved) { this.wakeRises = rises; this.wakeWatts = watts; this.tempStepsLeft = TEMP_SETTLE_STEPS; }
  }

  // The color span follows the physics when a part has a power reading: a multiple of the air's rise at the exhaust, all the power over rho cp times the flow.
  private updateSpan() {
    const u = this.streakMat?.uniforms;
    if (!u) return;
    const watts = sourceWatts(this.temps);
    let span = HEAT_COLOR_SPAN_C;
    if (this.input && watts.some(w => w >= 0)) {
      const total = watts.reduce((n, w) => n + Math.max(0, w), 0);
      span = Math.min(HEAT_SPAN_MAX_K, Math.max(HEAT_SPAN_MIN_K, HEAT_SPAN_PER_EXHAUST_RISE * exhaustRiseK(total, exhaustFlowCfm(this.input))));
    }
    u.uHeatSpan.value = span;
  }

  /** Solves again from the current fields: the temperature field has a new target. */
  private wake(rises: number[]) {
    this.wakeRises = rises;
    this.solving = true;
    this.stepsSinceEdit = 0;
    this.gate.invalidate();
  }

  /** New edit: rebuilds the voxel scene and re-solves from the current field. Null clears the layer. */
  setInput(input: FlowInput | null) {
    const previous = this.input;
    this.input = input;
    if (!this.supported) return;
    if (!input) { this.teardown(); return; }
    // A speed change alone keeps the solved field: the particles speed up or slow down instead. A structural change, or a speed mix far from the solved one once the minimum interval has passed, solves again.
    if (previous && this.flow && this.solvedInput && sameStructure(this.solvedInput, input)) {
      const drift = speedDrift(this.solvedInput, input);
      if (drift.worst <= RESOLVE_DRIFT || performance.now() - this.solvedAt < RESOLVE_MIN_INTERVAL_MS) {
        this.resolveDue = drift.worst > RESOLVE_DRIFT;
        this.speedFactor = Math.min(SPEED_FACTOR_MAX, Math.max(SPEED_FACTOR_MIN, drift.mean));
        this.setOptions(this.options);
        this.updateSpan();
        return;
      }
    }
    this.build(true);
  }

  private build(warm: boolean) {
    if (!this.input || !this.kind || !this.runner) return;
    const scene = buildFlowScene(this.input, this.tiers[this.tier]);
    const sameGrid = !!this.flow && !!this.fscene && this.fscene.dims.every((d, i) => d === scene.dims[i]);
    if (this.flow && sameGrid && warm) {
      this.flow.setScene(scene);
    } else {
      this.flow?.dispose();
      this.flow = new GlFlow(this.renderer, scene, this.kind);
      this.ensureParticles();
      this.resetParticles();
      this.coldStart = true;
      this.coldSteps = 0;
    }
    this.fscene = scene;
    this.solvedInput = this.input;
    if (DEV_TOOLS && this.input) (globalThis as { __nexusFlowInput?: unknown }).__nexusFlowInput = { fanCfm: this.input.fanCfm, ventCfm: this.input.ventCfm, referenceCfm: this.input.referenceCfm, stepSeconds: scene.stepSeconds, cellMm: scene.cellMm, buoyancy: scene.buoyancy, heatCells: scene.heatCellCount };
    this.solvedAt = performance.now();
    this.resolveDue = false;
    this.solveStartedAt = this.solvedAt;
    this.speedFactor = 1;
    this.setOptions(this.options);
    this.flow.setTemps(this.temps);
    this.wakeRises = sourceRises(this.temps);
    this.wakeWatts = sourceWatts(this.temps);
    this.heatCells = scene.heat.some(v => v === SOURCE_GPU || v === SOURCE_CPU);
    if (this.collisionsShown) this.syncCollisions(true);
    if (this.gridShown) this.syncGrid(true);
    this.uploadSpawns(scene);
    this.updateUniforms();
    this.updateSpan();
    this.stepsSinceEdit = 0;
    this.gate.invalidate();
    // A hot part drives a plume on its own, so a case with every fan stopped still solves.
    this.solving = scene.fanCount > 0 || (this.heatCells && this.flow.hot);
  }

  private uploadSpawns(scene: FlowScene) {
    const source = scene.emitters.length > 0 ? scene.emitters : this.flow?.hot ? scene.plumeEmitters : scene.emitters;
    const entries = source.length / EMITTER_STRIDE;
    const data = new Float32Array(Math.max(1, entries) * EMITTER_STRIDE);
    data.set(source);
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
    this.heatMat = pass(PARTICLE_HEAT, { ...base(), T: { value: null as unknown } });

    const geometry = new BufferGeometry();
    // A ribbon per particle: head to tail in STREAK_SEGMENTS segments, two vertices (one per side) at each of STREAK_SEGMENTS + 1 stations.
    const V = (STREAK_SEGMENTS + 1) * 2;
    const refs = new Float32Array(w * h * V * 2);
    const corners = new Float32Array(w * h * V * 2);
    const index = new Uint32Array(w * h * STREAK_SEGMENTS * 6);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = y * w + x;
      for (let c = 0; c < V; c++) {
        refs[(n * V + c) * 2] = x; refs[(n * V + c) * 2 + 1] = y;
        // corner.x: 1 at the head, 0 at the tail; corner.y: the side.
        corners[(n * V + c) * 2] = 1 - (c >> 1) / STREAK_SEGMENTS; corners[(n * V + c) * 2 + 1] = c & 1 ? 1 : -1;
      }
      for (let k = 0; k < STREAK_SEGMENTS; k++) {
        const a = n * V + k * 2;
        index.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], (n * STREAK_SEGMENTS + k) * 6);
      }
    }
    geometry.setAttribute('ref', new BufferAttribute(refs, 2));
    geometry.setAttribute('corner', new BufferAttribute(corners, 2));
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(w * h * V * 3), 3));
    geometry.setIndex(new BufferAttribute(index, 1));
    geometry.setDrawRange(0, drawnParticles(MAX_PARTICLES, TIER_PARTICLE_SHARE[this.tier]) * STREAK_SEGMENTS * 6);
    this.streakMat = new ShaderMaterial({
      glslVersion: GLSL3, vertexShader: STREAK_VERTEX, fragmentShader: STREAK_FRAGMENT,
      uniforms: {
        PA: { value: null as unknown }, PP: { value: null as unknown }, PB: { value: null as unknown }, uCell: { value: 1 }, uOrigin: { value: new Vector3() }, uCaseExtent: { value: this.extent.clone() },
        uMargin: { value: OUTSIDE_REACH_MM }, uWidthMm: { value: STREAK_WIDTH_MM }, uMinWidthPx: { value: STREAK_MIN_WIDTH_PX }, uViewport: { value: new Vector2(1, 1) }, uScale: { value: 400 },
        uMaxAge: { value: PARTICLE_MAX_AGE }, uLifeJitter: { value: PARTICLE_LIFE_JITTER }, uAlpha: { value: STREAK_ALPHA }, uTailWidth: { value: STREAK_TAIL_WIDTH }, uRate: { value: 1 },
        uN: { value: new Vector3() }, uTX: { value: 1 }, M: { value: null as unknown }, U: { value: null as unknown },
        uCool: { value: this.colors.cool }, uWarm: { value: this.colors.warm }, uHot: { value: this.colors.hot }, uHeatSpan: { value: HEAT_COLOR_SPAN_C },
      },
      transparent: true, depthWrite: false, depthTest: false, premultipliedAlpha: true, blending: NormalBlending, side: DoubleSide,
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
    if (this.tier >= this.tiers.length - 1) return;
    this.tier++;
    this.streaks?.geometry.setDrawRange(0, drawnParticles(MAX_PARTICLES, TIER_PARTICLE_SHARE[this.tier]) * STREAK_SEGMENTS * 6);
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
      (m.uniforms.uN.value as Vector3).copy(n);
      m.uniforms.uTX.value = flow.tx;
      m.uniforms.M.value = flow.maskTexture;
      // A new grid replaces the velocity texture: a stale one is a deleted GL name until a particle frame sets it.
      m.uniforms.U.value = flow.velocity;
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
    if (this.resolveDue && performance.now() - this.solvedAt >= RESOLVE_MIN_INTERVAL_MS) { this.build(true); return; }
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
      this.coldSteps += n;
      const spent = performance.now() - start;
      if (timed) {
        gl.endQuery(this.timer!.ext.TIME_ELAPSED_EXT);
        this.timer!.pending.push({ q: timed, steps: n });
      }
      // Outside the timed span: a PBO read inside an active query is an invalid operation.
      if (Math.floor(this.stepsSinceEdit / STEADY_CHECK_EVERY) > Math.floor(before / STEADY_CHECK_EVERY)) this.checkSteady(flow);
      this.paceSteps(dt, spent / n);
      this.slowCount = dt > SLOW_FRAME_MS ? this.slowCount + 1 : Math.max(0, this.slowCount - 1);
      if (this.slowCount >= SLOW_FRAMES && this.tier < this.tiers.length - 1 && this.stepsPerFrame <= MIN_STEPS_PER_FRAME + 1) {
        this.dropTier();
        return;
      }
    }
    if (!this.solving) this.coldStart = false;
    if (!this.solving && this.tempStepsLeft > 0 && wantsFlow) { flow.stepTemperature(); this.tempStepsLeft--; }
    // Particles wait for the first solver steps: with no velocity yet they would sit on their spawn points.
    if (this.options.particles && !(this.coldStart && this.solving && this.coldSteps < COLD_PARTICLE_STEPS) && this.stateMat && this.heatMat && this.streaks && this.spawnTex) {
      // Particle steps follow real elapsed time, not frames: the drawn speed is the same at any frame rate and while the camera moves.
      const particleSteps = this.clock.advance(dt);
      if (DEV_TOOLS) { const g = globalThis as { __nexusParticleSteps?: number; __nexusFrames?: number }; g.__nexusParticleSteps = (g.__nexusParticleSteps ?? 0) + particleSteps; g.__nexusFrames = (g.__nexusFrames ?? 0) + 1; }
      for (let st = 0; st < particleSteps; st++) {
        const next = (this.stateCur + 1) % RING;
        this.stateMat.uniforms.U.value = flow.velocity;
        this.stateMat.uniforms.PA.value = this.stateTargets[this.stateCur].texture;
        this.stateMat.uniforms.uSeed.value = (this.seed = (this.seed + 1) % 9973) * 0.137;
        this.runner.run(this.stateMat, this.stateTargets[next]);
        this.heatMat.uniforms.PA.value = this.stateTargets[next].texture;
        this.heatMat.uniforms.T.value = flow.temperature;
        this.runner.run(this.heatMat, this.heatTargets[next]);
        this.stateCur = next;
      }
      const scale = viewportHeight / (2 * Math.tan((camera.fov * Math.PI) / 360));
      const u = this.streakMat!.uniforms;
      u.PA.value = this.stateTargets[this.stateCur].texture;
      u.PP.value = this.stateTargets[(this.stateCur + RING - 1) % RING].texture;
      u.PB.value = this.heatTargets[this.stateCur].texture;
      u.U.value = flow.velocity;
      u.uRate.value = this.drawnSpeed() / PARTICLE_REFERENCE_SPEED;
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
    // With no fan the hot part's plume is the flow, so its temperature field must settle with the velocity.
    const minSteps = this.heatCells && flow.hot && (this.fscene?.fanCount ?? 1) === 0 ? TEMP_SETTLE_STEPS : 0;
    if ((this.gate.settles(r.du, r.u, STEADY_RATIO) && this.stepsSinceEdit >= minSteps) || this.stepsSinceEdit >= MAX_SOLVE_STEPS) {
      this.solving = false;
      if (DEV_TOOLS) (globalThis as { __nexusFlowStats?: unknown }).__nexusFlowStats = { cells: this.fscene ? this.fscene.dims[0] * this.fscene.dims[1] * this.fscene.dims[2] : 0, steps: this.stepsSinceEdit, ms: Math.round(performance.now() - this.solveStartedAt) };
      // The temperature field catches up with the frozen velocity in cheap single passes.
      if (this.heatCells) this.tempStepsLeft = TEMP_SETTLE_STEPS;
    }
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

  // Rebuilds the dev grid view for the current scene; `force` redraws it for a new one.
  private syncGrid(force = false) {
    if (this.gridView) { this.group.remove(this.gridView.group); this.gridView.dispose(); this.gridView = null; }
    this.gridShown = !!this.options.grid;
    const scene = this.fscene;
    if (!this.gridShown || !scene) { if (force) this.gridShown = !!this.options.grid; return; }
    this.gridView = buildGridView(scene);
    this.gridView.group.renderOrder = 1;
    this.group.add(this.gridView.group);
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
    if (this.gridView) { this.group.remove(this.gridView.group); this.gridView.dispose(); this.gridView = null; }
    if (this.collisions) { this.group.remove(this.collisions.group); this.collisions.dispose(); this.collisions = null; }
    this.flow?.dispose();
    this.flow = null;
    this.fscene = null;
    this.solvedInput = null;
    this.tempStepsLeft = 0;
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

const spinning = (input: FlowInput) => Object.keys(input.fanCfm).filter(k => input.fanCfm[k] > 0).sort();

/** True when two inputs differ only in how fast the spinning fans run: same layout, directions, spinning fans and vent direction. */
function sameStructure(a: FlowInput, b: FlowInput): boolean {
  if (a.layout !== b.layout || a.referenceCfm !== b.referenceCfm || Math.sign(a.ventCfm) !== Math.sign(b.ventCfm)) return false;
  const keys = new Set([...Object.keys(a.directions), ...Object.keys(b.directions)]);
  for (const k of keys) if (a.directions[k] !== b.directions[k]) return false;
  const sa = spinning(a);
  const sb = spinning(b);
  return sa.length === sb.length && sa.every((k, i) => k === sb[i]);
}

/** Mean speed ratio of the spinning fans against the solved input, and the worst fan's share of departure from that mean. */
function speedDrift(solved: FlowInput, next: FlowInput): { mean: number; worst: number } {
  const keys = spinning(solved);
  if (keys.length === 0) return { mean: 1, worst: 0 };
  const ratios = keys.map(k => next.fanCfm[k] / solved.fanCfm[k]);
  const mean = ratios.reduce((n, r) => n + r, 0) / ratios.length;
  const worst = Math.max(...ratios.map(r => Math.abs(r - mean) / mean));
  return { mean, worst };
}

/** Air leaving the case, CFM: the exhaust fans plus whatever the unfanned openings let out. GPU fans recirculate and are left out. */
function exhaustFlowCfm(input: FlowInput): number {
  let total = Math.max(0, input.ventCfm);
  for (const key of Object.keys(input.fanCfm)) {
    const slot = key.split('#')[0];
    if (!isGpuSlotKey(slot) && input.directions[slot] === 'exhaust') total += input.fanCfm[key];
  }
  return total;
}
