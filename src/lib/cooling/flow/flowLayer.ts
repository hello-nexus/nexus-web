import {
  AdditiveBlending, BackSide, BoxGeometry, BufferAttribute, BufferGeometry, Color, DataTexture, FloatType, GLSL3, InstancedMesh, Matrix4, Mesh,
  MeshBasicMaterial, NearestFilter, NormalBlending, Points, RGBAFormat, ShaderMaterial, Vector3, type Group, type PerspectiveCamera, type WebGLRenderer,
} from 'three';
import { GlFlow, PassRunner, floatSupport, pass, target, type FloatKind } from './glFlow';
import { DOMAIN_MARGIN_MM, GRID_LOW_CELLS, GRID_TARGET_CELLS, PARTICLE_MAX_AGE } from './flowParams';
import { buildFlowScene, surfaceSolids, type FlowInput, type FlowScene } from './gridScene';
import { FRAGMENT_OUT, PARTICLE_HEAT, PARTICLE_STATE, POINT_FRAGMENT, POINT_VERTEX, VOLUME_FRAGMENT, VOLUME_VERTEX } from './shaders';

/** Grid tiers by target cell count; a slow step drops one tier. */
export const FLOW_TIERS = [GRID_TARGET_CELLS, Math.round(GRID_TARGET_CELLS / 2), GRID_LOW_CELLS];
export const PARTICLE_TEXTURE = { w: 128, h: 64 };
const MAX_PARTICLES = PARTICLE_TEXTURE.w * PARTICLE_TEXTURE.h;
const SOLVER_BUDGET_MS = 7;
const MAX_STEPS_PER_FRAME = 8;
const MIN_STEPS_PER_FRAME = 1;
const PARTICLE_SUBSTEPS = 2;
const AGE_STEPS_PER_FRAME = 4;
/** Recirculation makes most air older than the straight-through time; the dead-zone volume shows air older than a few of those. */
const AGE_SCALE = 4;
const STEADY_CHECK_EVERY = 16;
const STEADY_RATIO = 0.01;
const MAX_SOLVE_STEPS = 1500;
const SLOW_FRAME_MS = 30;
const SLOW_FRAMES = 24;
const MAX_DEBUG_VOXELS = 80000;
const POINT_SIZE = 5;

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
  /** 0..1 share of the particle pool drawn. */
  density: number;
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
  private frames = 0;
  private lastFrameAt = 0;
  private options: FlowOptions = { particles: true, deadZones: false, density: 0.6, debugSolids: false };
  private seed = 1;

  private stateTargets: ReturnType<typeof target>[] = [];
  private heatTargets: ReturnType<typeof target>[] = [];
  private stateCur = 0;
  private stateMat: ShaderMaterial | null = null;
  private heatMat: ShaderMaterial | null = null;
  private spawnTex: DataTexture | null = null;
  private points: Points | null = null;
  private trail: Points | null = null;
  private pointMat: ShaderMaterial | null = null;
  private trailMat: ShaderMaterial | null = null;
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
    this.supported = this.kind !== null;
    this.runner = this.supported ? new PassRunner(renderer) : null;
    this.group = host;
  }

  /** The grid tier in use, 0 being the finest. */
  get currentTier(): number {
    return this.tier;
  }

  /** Whether the layer still has something to animate: a solve in progress, or particles drawn. */
  get active(): boolean {
    return this.supported && !!this.fscene && (this.solving || this.options.particles || this.options.deadZones);
  }

  setOptions(options: FlowOptions) {
    this.options = options;
    if (this.points) {
      this.points.visible = options.particles;
      this.trail!.visible = options.particles;
      this.points.geometry.setDrawRange(0, Math.round(MAX_PARTICLES * options.density));
    }
    if (this.volume) this.volume.visible = options.deadZones;
    if (this.fscene) this.syncDebug();
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
    }
    this.fscene = scene;
    this.ageRef = Math.max(60, scene.residenceSteps * AGE_SCALE);
    this.uploadSpawns(scene);
    this.updateUniforms();
    this.syncDebug();
    this.stepsSinceEdit = 0;
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
    const fill = new Float32Array(w * h * 4);
    for (let i = 0; i < w * h; i++) fill[i * 4 + 3] = PARTICLE_MAX_AGE * 5;
    const init = new DataTexture(fill, w, h, RGBAFormat, FloatType);
    init.needsUpdate = true;
    this.stateTargets = [target(w, h, FloatType), target(w, h, FloatType)];
    this.heatTargets = [target(w, h, FloatType), target(w, h, FloatType)];
    const blit = pass(FRAGMENT_OUT + 'uniform sampler2D T; void main(){ gl_FragColor = texelFetch(T, ivec2(gl_FragCoord.xy), 0); }', { T: { value: init } });
    this.runner!.run(blit, this.stateTargets[0]);
    blit.dispose();
    init.dispose();
    const base = () => ({
      uN: { value: new Vector3() }, uTX: { value: 1 }, M: { value: null as unknown }, U: { value: null as unknown },
      PA: { value: null as unknown }, SP: { value: null as unknown }, uSpawnCount: { value: 0 }, uSeed: { value: 0 }, uMaxAge: { value: PARTICLE_MAX_AGE },
    });
    this.stateMat = pass(PARTICLE_STATE, base());
    this.heatMat = pass(PARTICLE_HEAT, { ...base(), PB: { value: null as unknown } });

    const geometry = new BufferGeometry();
    const refs = new Float32Array(w * h * 2);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { refs[(y * w + x) * 2] = x; refs[(y * w + x) * 2 + 1] = y; }
    geometry.setAttribute('ref', new BufferAttribute(refs, 2));
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(w * h * 3), 3));
    geometry.setDrawRange(0, Math.round(MAX_PARTICLES * this.options.density));
    const pointUniforms = (alpha: number, size: number) => ({
      PA: { value: null as unknown }, PB: { value: null as unknown }, uCell: { value: 1 }, uOrigin: { value: new Vector3() }, uCaseExtent: { value: this.extent.clone() },
      uMargin: { value: DOMAIN_MARGIN_MM }, uSize: { value: size }, uScale: { value: 400 }, uMaxAge: { value: PARTICLE_MAX_AGE }, uAlpha: { value: alpha },
      uCool: { value: this.colors.cool }, uWarm: { value: this.colors.warm }, uHot: { value: this.colors.hot },
    });
    const material = (alpha: number, size: number) => new ShaderMaterial({
      glslVersion: GLSL3, vertexShader: POINT_VERTEX, fragmentShader: POINT_FRAGMENT, uniforms: pointUniforms(alpha, size),
      transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending,
    });
    this.pointMat = material(0.6, POINT_SIZE);
    this.trailMat = material(0.22, POINT_SIZE * 0.7);
    this.points = new Points(geometry, this.pointMat);
    this.trail = new Points(geometry, this.trailMat);
    for (const p of [this.points, this.trail]) { p.frustumCulled = false; p.renderOrder = 5; this.group.add(p); }
    this.trail.renderOrder = 4;

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
    for (const m of [this.pointMat, this.trailMat]) {
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
    if (this.solving && wantsFlow) {
      const start = performance.now();
      for (let i = 0; i < this.stepsPerFrame; i++) {
        flow.step();
        this.stepsSinceEdit++;
        if (this.stepsSinceEdit % STEADY_CHECK_EVERY === 0) {
          const { du, u } = flow.measure();
          const settled = Number.isFinite(u) && u > 1e-6 && du < STEADY_RATIO * u;
          if (settled || this.stepsSinceEdit >= MAX_SOLVE_STEPS || !Number.isFinite(u)) { this.solving = false; break; }
        }
      }
      const spent = performance.now() - start;
      if (spent > SOLVER_BUDGET_MS && this.stepsPerFrame > MIN_STEPS_PER_FRAME) this.stepsPerFrame--;
      else if (spent < SOLVER_BUDGET_MS / 2 && this.stepsPerFrame < MAX_STEPS_PER_FRAME) this.stepsPerFrame++;
      this.frames++;
      this.slowCount = dt > SLOW_FRAME_MS ? this.slowCount + 1 : Math.max(0, this.slowCount - 1);
      if (this.slowCount >= SLOW_FRAMES && this.tier < FLOW_TIERS.length - 1 && this.stepsPerFrame <= MIN_STEPS_PER_FRAME + 1) {
        this.tier++;
        this.slowCount = 0;
        this.build(false);
        return;
      }
    }
    if (this.options.deadZones && !this.solving) {
      for (let i = 0; i < AGE_STEPS_PER_FRAME; i++) flow.stepAge();
      if (this.volumeMat) this.volumeMat.uniforms.AG.value = flow.ageTexture;
    }
    if (this.options.particles && this.stateMat && this.heatMat && this.points && this.spawnTex) {
      for (let s = 0; s < PARTICLE_SUBSTEPS; s++) {
        const a0 = this.stateTargets[this.stateCur];
        const a1 = this.stateTargets[1 - this.stateCur];
        const b0 = this.heatTargets[this.stateCur];
        const b1 = this.heatTargets[1 - this.stateCur];
        this.stateMat.uniforms.U.value = flow.velocity;
        this.stateMat.uniforms.PA.value = a0.texture;
        this.stateMat.uniforms.uSeed.value = (this.seed = (this.seed + 1) % 9973) * 0.137;
        this.runner.run(this.stateMat, a1);
        this.heatMat.uniforms.PA.value = a1.texture;
        this.heatMat.uniforms.PB.value = b0.texture;
        this.runner.run(this.heatMat, b1);
        this.stateCur = 1 - this.stateCur;
      }
      const cur = this.stateTargets[this.stateCur];
      const old = this.stateTargets[1 - this.stateCur];
      const scale = viewportHeight / (2 * Math.tan((camera.fov * Math.PI) / 360));
      this.pointMat!.uniforms.PA.value = cur.texture;
      this.pointMat!.uniforms.PB.value = this.heatTargets[this.stateCur].texture;
      this.trailMat!.uniforms.PA.value = old.texture;
      this.trailMat!.uniforms.PB.value = this.heatTargets[1 - this.stateCur].texture;
      this.pointMat!.uniforms.uScale.value = scale;
      this.trailMat!.uniforms.uScale.value = scale;
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

  private teardown() {
    this.flow?.dispose();
    this.flow = null;
    this.fscene = null;
    this.solving = false;
    if (this.debug) { this.group.remove(this.debug); this.debug.geometry.dispose(); (this.debug.material as MeshBasicMaterial).dispose(); this.debug.dispose(); this.debug = null; }
    for (const p of [this.points, this.trail]) if (p) p.visible = false;
    if (this.volume) this.volume.visible = false;
  }

  dispose() {
    this.teardown();
    for (const t of [...this.stateTargets, ...this.heatTargets]) t.dispose();
    for (const m of [this.stateMat, this.heatMat, this.pointMat, this.trailMat, this.volumeMat]) m?.dispose();
    this.spawnTex?.dispose();
    this.points?.geometry.dispose();
    this.volume?.geometry.dispose();
    for (const o of [this.points, this.trail, this.volume]) if (o) this.group.remove(o);
    this.runner?.dispose();
    this.stateMat = null;
  }
}
