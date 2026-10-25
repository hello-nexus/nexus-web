import {
  AdditiveBlending, BackSide, BoxGeometry, BufferAttribute, BufferGeometry, Color, DataTexture, FloatType, GLSL3, InstancedMesh, Matrix4, Mesh,
  MeshBasicMaterial, NearestFilter, NormalBlending, Points, RGBAFormat, ShaderMaterial, Vector3, type Group, type PerspectiveCamera, type WebGLRenderer,
} from 'three';
import { GlFlow, PassRunner, floatSupport, pass, target, type FloatKind } from './glFlow';
import { DOMAIN_MARGIN_MM, GRID_LOW_CELLS, GRID_TARGET_CELLS, PARTICLE_BIRTH_SPREAD, PARTICLE_LIFE_JITTER, PARTICLE_MAX_AGE } from './flowParams';
import { SteadyGate } from './steadyGate';
import { buildFlowScene, surfaceSolids, type FlowInput, type FlowScene } from './gridScene';
import { FRAGMENT_OUT, PARTICLE_HEAT, PARTICLE_STATE, POINT_FRAGMENT, POINT_VERTEX, VOLUME_FRAGMENT, VOLUME_VERTEX } from './shaders';

/** Grid tiers by target cell count; a slow step drops one tier. */
export const FLOW_TIERS = [GRID_TARGET_CELLS, Math.round(GRID_TARGET_CELLS / 2), GRID_LOW_CELLS];
/** Fixed particle pool; a coarser grid tier draws a share of it. */
export const PARTICLE_TEXTURE = { w: 128, h: 84 };
const TIER_PARTICLE_SHARE = [1, 0.75, 0.5];
/** Positions kept per particle: the current one and this many older ones, drawn as a trail. */
const TRAIL_AGES = 1;
const RING = TRAIL_AGES + 1;
const MAX_PARTICLES = PARTICLE_TEXTURE.w * PARTICLE_TEXTURE.h;
/** GPU time the solver may take per displayed frame. */
const SOLVER_BUDGET_MS = 6;
/** Without a GPU timer, frames longer than this (ms) pull the step count down, and frames this close to the vsync interval let it grow. */
const FRAME_SLOW_MS = 20;
const FRAME_FAST_MS = 17.5;
const TIMER_EMA = 0.3;
const MAX_STEPS_PER_FRAME = 8;
const MIN_STEPS_PER_FRAME = 1;
const PARTICLE_SUBSTEPS = 2;
const AGE_STEPS_PER_FRAME = 4;
/** Dead-zone age scale, as a multiple of the straight-through time. */
const AGE_SCALE = 4;
const STEADY_CHECK_EVERY = 16;
const STEADY_RATIO = 0.01;
const MAX_SOLVE_STEPS = 1500;
const SLOW_FRAME_MS = 30;
const SLOW_FRAMES = 24;
const MAX_DEBUG_VOXELS = 80000;
/** Point size in mm at unit scale, the on-screen minimum in px, and the one trail copy's alpha and size share. */
const POINT_SIZE = 5;
const POINT_MIN_PX = 1;
const TRAIL_MIN_PX = 1;
const TRAIL_ALPHA = [0.286];
const TRAIL_SIZE = [0.7];

export interface FlowColors {
  cool: Color;
  warm: Color;
  hot: Color;
  /** Dead-zone volume tint. */
  dead: Color;
  /** Debug solids. */
  solid: Color;
}

export interface FlowOptions {
  particles: boolean;
  deadZones: boolean;
  debugSolids: boolean;
}

/** The airflow layer of the case view: solver, particles, dead-zone volume and the solid-voxel debug view, all on the renderer's own context. */
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
  private options: FlowOptions = { particles: true, deadZones: false, debugSolids: false };
  private seed = 1;
  private debugShown = false;
  private coldStart = false;
  private readonly gate = new SteadyGate();
  private readonly timer: { ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }; pending: { q: WebGLQuery; steps: number }[]; msPerStep: number } | null;

  private stateTargets: ReturnType<typeof target>[] = [];
  private heatTargets: ReturnType<typeof target>[] = [];
  private stateCur = 0;
  private stateMat: ShaderMaterial | null = null;
  private heatMat: ShaderMaterial | null = null;
  private spawnTex: DataTexture | null = null;
  private points: Points | null = null;
  private trails: Points[] = [];
  private pointMat: ShaderMaterial | null = null;
  private trailMats: ShaderMaterial[] = [];
  private volume: Mesh | null = null;
  private volumeMat: ShaderMaterial | null = null;
  private debug: InstancedMesh | null = null;
  private ageRef = 1;

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

  /** Whether the layer still has something to animate: a solve in progress, or particles drawn. */
  get active(): boolean {
    return this.supported && !!this.fscene && (this.solving || this.options.particles || this.options.deadZones);
  }

  setOptions(options: FlowOptions) {
    this.options = options;
    if (this.points) {
      this.points.visible = options.particles;
      for (const t of this.trails) t.visible = options.particles;
    }
    if (this.volume) this.volume.visible = options.deadZones;
    if (this.fscene && options.debugSolids !== this.debugShown) this.syncDebug();
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
      this.flow = new GlFlow(this.renderer, this.runner, scene, this.kind);
      this.ensureParticles();
      this.resetParticles();
      this.coldStart = true;
    }
    this.fscene = scene;
    this.ageRef = Math.max(60, scene.residenceSteps * AGE_SCALE);
    this.uploadSpawns(scene);
    this.updateUniforms();
    this.syncDebug();
    this.stepsSinceEdit = 0;
    this.gate.invalidate();
    this.solving = scene.fanCount > 0;
    this.flow?.resetAge();
  }

  private uploadSpawns(scene: FlowScene) {
    const n = Math.max(1, scene.spawns.length / 3);
    const data = new Float32Array(n * 4);
    for (let i = 0; i < scene.spawns.length / 3; i++) {
      data[i * 4] = scene.spawns[i * 3]; data[i * 4 + 1] = scene.spawns[i * 3 + 1]; data[i * 4 + 2] = scene.spawns[i * 3 + 2];
    }
    this.spawnTex?.dispose();
    this.spawnTex = new DataTexture(data, n, 1, RGBAFormat, FloatType);
    this.spawnTex.minFilter = NearestFilter;
    this.spawnTex.magFilter = NearestFilter;
    this.spawnTex.needsUpdate = true;
    for (const m of [this.stateMat]) if (m) { m.uniforms.SP.value = this.spawnTex; m.uniforms.uSpawnCount.value = scene.spawns.length / 3; }
  }

  private ensureParticles() {
    if (!this.kind || this.stateMat) return;
    const { w, h } = PARTICLE_TEXTURE;
    this.stateTargets = Array.from({ length: RING }, () => target(w, h, this.kind!));
    this.heatTargets = Array.from({ length: RING }, () => target(w, h, this.kind!));
    const base = () => ({
      uN: { value: new Vector3() }, uTX: { value: 1 }, M: { value: null as unknown }, U: { value: null as unknown },
      PA: { value: null as unknown }, SP: { value: null as unknown }, uSpawnCount: { value: 0 }, uSeed: { value: 0 }, uMaxAge: { value: PARTICLE_MAX_AGE }, uBirthSpread: { value: PARTICLE_BIRTH_SPREAD }, uLifeJitter: { value: PARTICLE_LIFE_JITTER },
    });
    this.stateMat = pass(PARTICLE_STATE, base());
    this.heatMat = pass(PARTICLE_HEAT, { ...base(), PB: { value: null as unknown } });

    const geometry = new BufferGeometry();
    const refs = new Float32Array(w * h * 2);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { refs[(y * w + x) * 2] = x; refs[(y * w + x) * 2 + 1] = y; }
    geometry.setAttribute('ref', new BufferAttribute(refs, 2));
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(w * h * 3), 3));
    geometry.setDrawRange(0, Math.round(MAX_PARTICLES * TIER_PARTICLE_SHARE[this.tier]));
    const pointUniforms = (alpha: number, size: number, minPx: number) => ({
      PA: { value: null as unknown }, PB: { value: null as unknown }, uCell: { value: 1 }, uOrigin: { value: new Vector3() }, uCaseExtent: { value: this.extent.clone() },
      uMargin: { value: DOMAIN_MARGIN_MM }, uSize: { value: size }, uScale: { value: 400 }, uMinPx: { value: minPx }, uMaxAge: { value: PARTICLE_MAX_AGE }, uLifeJitter: { value: PARTICLE_LIFE_JITTER }, uAlpha: { value: alpha },
      uCool: { value: this.colors.cool }, uWarm: { value: this.colors.warm }, uHot: { value: this.colors.hot },
    });
    // Head and trail: additive soft sprites; the trail is fainter.
    this.pointMat = new ShaderMaterial({
      glslVersion: GLSL3, vertexShader: POINT_VERTEX, fragmentShader: POINT_FRAGMENT, uniforms: pointUniforms(0.78, POINT_SIZE, POINT_MIN_PX),
      transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending,
    });
    this.trailMats = TRAIL_ALPHA.map((alpha, i) => new ShaderMaterial({
      glslVersion: GLSL3, vertexShader: POINT_VERTEX, fragmentShader: POINT_FRAGMENT, uniforms: pointUniforms(alpha, POINT_SIZE * TRAIL_SIZE[i], TRAIL_MIN_PX),
      transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending,
    }));
    this.points = new Points(geometry, this.pointMat);
    this.trails = this.trailMats.map(m => new Points(geometry, m));
    for (const p of [this.points, ...this.trails]) { p.frustumCulled = false; this.group.add(p); }
    this.points.renderOrder = 6;
    this.trails.forEach((t, i) => { t.renderOrder = 5 - i; });

    this.volumeMat = new ShaderMaterial({
      glslVersion: GLSL3, vertexShader: VOLUME_VERTEX, fragmentShader: VOLUME_FRAGMENT,
      uniforms: {
        uN: { value: new Vector3() }, uTX: { value: 1 }, M: { value: null as unknown }, U: { value: null as unknown }, AG: { value: null as unknown },
        uCell: { value: 1 }, uOrigin: { value: new Vector3() }, uCaseExtent: { value: this.extent.clone() }, uAgeRef: { value: 1 }, uColor: { value: this.colors.dead },
      },
      transparent: true, depthWrite: false, depthTest: false, side: BackSide, blending: NormalBlending,
    });
    this.volume = new Mesh(new BoxGeometry(this.extent.x, this.extent.y, this.extent.z), this.volumeMat);
    this.volume.position.copy(this.extent).multiplyScalar(0.5);
    this.volume.renderOrder = 3;
    this.volume.visible = this.options.deadZones;
    this.group.add(this.volume);
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
    this.points?.geometry.setDrawRange(0, Math.round(MAX_PARTICLES * TIER_PARTICLE_SHARE[this.tier]));
    this.slowCount = 0;
    this.build(false);
  }

  private updateUniforms() {
    const flow = this.flow;
    const scene = this.fscene;
    if (!flow || !scene) return;
    const n = new Vector3(...scene.dims);
    const origin = new Vector3(...scene.origin);
    for (const m of [this.stateMat, this.heatMat, this.volumeMat]) {
      if (!m) continue;
      (m.uniforms.uN.value as Vector3).copy(n);
      m.uniforms.uTX.value = flow.tx;
      m.uniforms.M.value = flow.maskTexture;
    }
    for (const m of [this.pointMat, ...this.trailMats]) {
      if (!m) continue;
      m.uniforms.uCell.value = scene.cellMm;
      (m.uniforms.uOrigin.value as Vector3).copy(origin);
    }
    if (this.volumeMat) {
      this.volumeMat.uniforms.uCell.value = scene.cellMm;
      (this.volumeMat.uniforms.uOrigin.value as Vector3).copy(origin);
      this.volumeMat.uniforms.uAgeRef.value = this.ageRef;
    }
  }

  private syncDebug() {
    if (this.debug) { this.group.remove(this.debug); this.debug.geometry.dispose(); (this.debug.material as MeshBasicMaterial).dispose(); this.debug.dispose(); this.debug = null; }
    const scene = this.fscene;
    this.debugShown = this.options.debugSolids;
    if (!scene || !this.options.debugSolids) return;
    const pts = surfaceSolids(scene);
    const count = Math.min(MAX_DEBUG_VOXELS, pts.length / 3);
    const mesh = new InstancedMesh(
      new BoxGeometry(scene.cellMm * 0.92, scene.cellMm * 0.92, scene.cellMm * 0.92),
      new MeshBasicMaterial({ color: this.colors.solid, transparent: true, opacity: 0.07, depthWrite: false }),
      count,
    );
    const m = new Matrix4();
    for (let i = 0; i < count; i++) { m.setPosition(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]); mesh.setMatrixAt(i, m); }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.renderOrder = 2;
    mesh.frustumCulled = false;
    this.debug = mesh;
    this.group.add(mesh);
  }

  /** Runs the solver and particle passes for one displayed frame. Call before rendering the scene. */
  frame(now: number, camera: PerspectiveCamera, viewportHeight: number) {
    const flow = this.flow;
    const scene = this.fscene;
    if (!this.supported || !flow || !scene || !this.runner) return;
    const dt = this.lastFrameAt ? now - this.lastFrameAt : 0;
    this.lastFrameAt = now;

    const wantsFlow = this.options.particles || this.options.deadZones;
    this.pollSteady(flow);
    if (this.solving && wantsFlow) {
      this.pollTimer();
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      const timed = this.timer && this.timer.pending.length < 4 ? gl.createQuery() : null;
      if (timed) gl.beginQuery(this.timer!.ext.TIME_ELAPSED_EXT, timed);
      let ran = 0;
      let check = false;
      for (let i = 0; i < this.stepsPerFrame; i++) {
        flow.step();
        ran++;
        this.stepsSinceEdit++;
        if (this.stepsSinceEdit % STEADY_CHECK_EVERY === 0) check = true;
      }
      if (timed) {
        gl.endQuery(this.timer!.ext.TIME_ELAPSED_EXT);
        this.timer!.pending.push({ q: timed, steps: ran });
      }
      // Outside the timed span: a PBO read inside an active query is an invalid operation.
      if (check) this.checkSteady(flow);
      this.paceSteps(dt);
      this.slowCount = dt > SLOW_FRAME_MS ? this.slowCount + 1 : Math.max(0, this.slowCount - 1);
      if (this.slowCount >= SLOW_FRAMES && this.tier < FLOW_TIERS.length - 1 && this.stepsPerFrame <= MIN_STEPS_PER_FRAME + 1) {
        this.dropTier();
        return;
      }
    }
    if (this.options.deadZones && !this.solving) {
      for (let i = 0; i < AGE_STEPS_PER_FRAME; i++) flow.stepAge();
      if (this.volumeMat) this.volumeMat.uniforms.AG.value = flow.ageTexture;
    }
    if (!this.solving) this.coldStart = false;
    // Particles wait for the first solve: with no velocity yet they would sit on their spawn points.
    if (this.options.particles && !(this.coldStart && this.solving) && this.stateMat && this.heatMat && this.points && this.spawnTex) {
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
      this.pointMat!.uniforms.PA.value = this.stateTargets[this.stateCur].texture;
      this.pointMat!.uniforms.PB.value = this.heatTargets[this.stateCur].texture;
      this.pointMat!.uniforms.uScale.value = scale;
      this.trailMats.forEach((m, a) => {
        const at = (this.stateCur - 1 - a + 2 * RING) % RING;
        m.uniforms.PA.value = this.stateTargets[at].texture;
        m.uniforms.PB.value = this.heatTargets[at].texture;
        m.uniforms.uScale.value = scale;
      });
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

  // Sets the steps run per frame so the solver stays inside its GPU budget: from measured GPU time per step when the timer exists, else from frame deltas.
  private paceSteps(dt: number) {
    let next = this.stepsPerFrame;
    if (this.timer && this.timer.msPerStep > 0) next = Math.floor(SOLVER_BUDGET_MS / this.timer.msPerStep);
    else if (dt > FRAME_SLOW_MS) next = this.stepsPerFrame - 1;
    else if (dt > 0 && dt < FRAME_FAST_MS) next = this.stepsPerFrame + 1;
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

  private teardown() {
    this.flow?.dispose();
    this.flow = null;
    this.fscene = null;
    this.solving = false;
    if (this.debug) { this.group.remove(this.debug); this.debug.geometry.dispose(); (this.debug.material as MeshBasicMaterial).dispose(); this.debug.dispose(); this.debug = null; }
    for (const p of [this.points, ...this.trails]) if (p) p.visible = false;
    if (this.volume) this.volume.visible = false;
  }

  dispose() {
    this.teardown();
    for (const t of [...this.stateTargets, ...this.heatTargets]) t.dispose();
    for (const m of [this.stateMat, this.heatMat, this.pointMat, ...this.trailMats, this.volumeMat]) m?.dispose();
    this.spawnTex?.dispose();
    this.points?.geometry.dispose();
    this.volume?.geometry.dispose();
    for (const o of [this.points, ...this.trails, this.volume]) if (o) this.group.remove(o);
    if (this.timer) for (const { q } of this.timer.pending) (this.renderer.getContext() as WebGL2RenderingContext).deleteQuery(q);
    this.runner?.dispose();
    this.stateMat = null;
  }
}
