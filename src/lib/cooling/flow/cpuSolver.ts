import { DAMPING, FAN_BLEND, JACOBI_ITERATIONS, MAX_RISE_K, TEMP_DIFFUSION, VMAX_CELLS } from './flowParams';
import { SOURCE_ROOM, powerRisePerStep, type FlowScene } from './gridScene';
import { NO_TEMPS, heatStep, isHot, sourceRises, sourceWatts, type ComponentTemps } from './heatModel';

/**
 * CPU reference of the GPU solver in `shaders.ts`: same equations and boundary rules, one step per call.
 * Every cell on the domain boundary is solid or fixed-pressure, so the pressure and divergence loops stay in the interior.
 */
export class CpuFlow {
  readonly n: number;
  u: Float32Array;
  /** Degrees each cell's air is above room temperature; below zero is cooler. */
  t: Float32Array;
  private tNext: Float32Array;
  /** What each part's heat cells pull the air toward, as degrees above room temperature, by `SOURCE_*`; negative means that part heats nothing. */
  private rises = sourceRises(NO_TEMPS);
  /** Degrees per step each part's power adds to its heat cells, by `SOURCE_*`; negative falls back on the part's temperature. */
  private powerRise: [number, number, number] = [-1, -1, -1];
  private watts: [number, number, number] = [-1, -1, -1];
  private next: Float32Array;
  private p: Float32Array;
  private p2: Float32Array;
  private readonly div: Float32Array;
  private readonly fluid: Float32Array;
  private readonly invCount: Float32Array;
  private readonly NX: number;
  private readonly NY: number;
  private readonly NZ: number;
  scene: FlowScene;
  private readonly iterations: number;


  constructor(scene: FlowScene, iterations: number = JACOBI_ITERATIONS) {
    this.scene = scene;
    this.iterations = iterations;
    [this.NX, this.NY, this.NZ] = scene.dims;
    const { NX, NY, NZ } = this;
    this.n = NX * NY * NZ;
    this.u = new Float32Array(this.n * 3);
    this.next = new Float32Array(this.n * 3);
    this.t = new Float32Array(this.n);
    this.tNext = new Float32Array(this.n);
    this.p = new Float32Array(this.n);
    this.p2 = new Float32Array(this.n);
    this.div = new Float32Array(this.n);
    this.fluid = new Float32Array(this.n);
    this.invCount = new Float32Array(this.n);
    this.bind(scene);
  }

  /** Warm update: a scene on the same grid replaces the obstacles, openings and fans; velocity and pressure are kept, except in cells that became solid. */
  setScene(scene: FlowScene): void {
    if (scene.dims.some((d, i) => d !== this.scene.dims[i])) throw new Error('setScene needs the same grid');
    this.scene = scene;
    this.powerRise = this.watts.map((w, source) => powerRisePerStep(scene, source, w)) as [number, number, number];
    this.bind(scene);
    for (let c = 0; c < this.n; c++) {
      if (!scene.solid[c]) continue;
      this.u[c * 3] = 0; this.u[c * 3 + 1] = 0; this.u[c * 3 + 2] = 0;
      this.p[c] = 0;
      this.t[c] = 0;
    }
  }

  /** New part temperatures: read by the next step, nothing restarts. */
  setTemps(temps: ComponentTemps): void {
    this.rises = sourceRises(temps);
    this.watts = sourceWatts(temps);
    this.powerRise = this.watts.map((w, source) => powerRisePerStep(this.scene, source, w)) as [number, number, number];
  }

  /** Whether any part is hot enough to drive a plume on its own. */
  get hot(): boolean {
    return isHot(this.rises, this.watts);
  }

  private bind(scene: FlowScene): void {
    const { NX, NY, NZ } = this;
    for (let c = 0; c < this.n; c++) this.fluid[c] = scene.solid[c] ? 0 : 1;
    this.invCount.fill(0);
    const sx = 1, sy = NX, sz = NX * NY;
    for (let k = 1; k < NZ - 1; k++) for (let j = 1; j < NY - 1; j++) for (let i = 1; i < NX - 1; i++) {
      const c = i + NX * (j + NY * k);
      const cnt = this.fluid[c - sx] + this.fluid[c + sx] + this.fluid[c - sy] + this.fluid[c + sy] + this.fluid[c - sz] + this.fluid[c + sz];
      this.invCount[c] = cnt > 0 ? 1 / cnt : 0;
    }
  }

  /** Trilinear velocity at cell coordinates (cell centers at integers); solid cells contribute nothing. Writes into `r`. */
  sample(px: number, py: number, pz: number, r: number[] | Float32Array): void {
    const { NX, NY, NZ } = this;
    const solid = this.scene.solid;
    const u = this.u;
    const x = Math.min(Math.max(px, 0), NX - 1), y = Math.min(Math.max(py, 0), NY - 1), z = Math.min(Math.max(pz, 0), NZ - 1);
    const i0 = Math.floor(x), j0 = Math.floor(y), k0 = Math.floor(z);
    const fx = x - i0, fy = y - j0, fz = z - k0;
    const i1 = Math.min(i0 + 1, NX - 1), j1 = Math.min(j0 + 1, NY - 1), k1 = Math.min(k0 + 1, NZ - 1);
    let ax = 0, ay = 0, az = 0;
    for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const w = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
      if (w === 0) continue;
      const c = (dx ? i1 : i0) + NX * ((dy ? j1 : j0) + NY * (dz ? k1 : k0));
      if (solid[c]) continue;
      ax += w * u[c * 3]; ay += w * u[c * 3 + 1]; az += w * u[c * 3 + 2];
    }
    r[0] = ax; r[1] = ay; r[2] = az;
  }

  /** Trilinear value of `field` at cell coordinates, averaged over the fluid cells only so a wall does not cool the air beside it. */
  sampleScalar(field: Float32Array, px: number, py: number, pz: number): number {
    const { NX, NY, NZ } = this;
    const solid = this.scene.solid;
    const x = Math.min(Math.max(px, 0), NX - 1), y = Math.min(Math.max(py, 0), NY - 1), z = Math.min(Math.max(pz, 0), NZ - 1);
    const i0 = Math.floor(x), j0 = Math.floor(y), k0 = Math.floor(z);
    const fx = x - i0, fy = y - j0, fz = z - k0;
    const i1 = Math.min(i0 + 1, NX - 1), j1 = Math.min(j0 + 1, NY - 1), k1 = Math.min(k0 + 1, NZ - 1);
    let acc = 0, wsum = 0;
    for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const w = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
      if (w === 0) continue;
      const c = (dx ? i1 : i0) + NX * ((dy ? j1 : j0) + NY * (dz ? k1 : k0));
      if (solid[c]) continue;
      acc += w * field[c]; wsum += w;
    }
    return wsum > 0 ? acc / wsum : 0;
  }

  /** Degrees above room temperature at cell coordinates. */
  riseAt(px: number, py: number, pz: number): number {
    return this.sampleScalar(this.t, px, py, pz);
  }

  step(): void {
    const { NX, NY, NZ, scene } = this;
    const { solid, open, darcy, target, fanCell } = scene;
    const sx = 1, sy = NX, sz = NX * NY;
    const a = [0, 0, 0];
    const u = this.u;
    const out = this.next;

    for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const c = i + NX * (j + NY * k);
      if (solid[c]) { out[c * 3] = 0; out[c * 3 + 1] = 0; out[c * 3 + 2] = 0; continue; }
      this.sample(i - u[c * 3], j - u[c * 3 + 1], k - u[c * 3 + 2], a);
      let x = a[0], y = a[1] + this.scene.buoyancy * this.t[c], z = a[2];
      if (fanCell[c]) {
        x += (target[c * 3] - x) * FAN_BLEND; y += (target[c * 3 + 1] - y) * FAN_BLEND; z += (target[c * 3 + 2] - z) * FAN_BLEND;
      }
      const drag = (1 + darcy[c]) / DAMPING;
      x /= drag; y /= drag; z /= drag;
      const m = Math.hypot(x, y, z);
      if (m > VMAX_CELLS) { const s = VMAX_CELLS / m; x *= s; y *= s; z *= s; }
      out[c * 3] = x; out[c * 3 + 1] = y; out[c * 3 + 2] = z;
    }
    this.u = out;
    this.next = u;
    const v = this.u;
    const fl = this.fluid;
    const div = this.div;

    for (let k = 1; k < NZ - 1; k++) for (let j = 1; j < NY - 1; j++) for (let i = 1; i < NX - 1; i++) {
      const c = i + NX * (j + NY * k);
      if (solid[c] || open[c]) { div[c] = 0; continue; }
      div[c] = 0.5 * (v[(c + sx) * 3] * fl[c + sx] - v[(c - sx) * 3] * fl[c - sx]
        + v[(c + sy) * 3 + 1] * fl[c + sy] - v[(c - sy) * 3 + 1] * fl[c - sy]
        + v[(c + sz) * 3 + 2] * fl[c + sz] - v[(c - sz) * 3 + 2] * fl[c - sz]);
    }

    let p = this.p, q = this.p2;
    const ic = this.invCount;
    for (let it = 0; it < this.iterations; it++) {
      for (let k = 1; k < NZ - 1; k++) for (let j = 1; j < NY - 1; j++) for (let i = 1; i < NX - 1; i++) {
        const c = i + NX * (j + NY * k);
        if (solid[c] || open[c]) { q[c] = 0; continue; }
        q[c] = (fl[c - sx] * p[c - sx] + fl[c + sx] * p[c + sx] + fl[c - sy] * p[c - sy] + fl[c + sy] * p[c + sy] + fl[c - sz] * p[c - sz] + fl[c + sz] * p[c + sz] - div[c]) * ic[c];
      }
      const t = p; p = q; q = t;
    }
    this.p = p;
    this.p2 = q;

    // The gradient reads a solid neighbor as the cell's own pressure, so no pressure force crosses a wall.
    const pn = (nb: number, pc: number) => (solid[nb] ? pc : p[nb]);
    for (let k = 1; k < NZ - 1; k++) for (let j = 1; j < NY - 1; j++) for (let i = 1; i < NX - 1; i++) {
      const c = i + NX * (j + NY * k);
      if (solid[c]) continue;
      const pc = open[c] ? 0 : p[c];
      let x = v[c * 3] - 0.5 * (pn(c + sx, pc) - pn(c - sx, pc));
      let y = v[c * 3 + 1] - 0.5 * (pn(c + sy, pc) - pn(c - sy, pc));
      let z = v[c * 3 + 2] - 0.5 * (pn(c + sz, pc) - pn(c - sz, pc));
      // No penetration: nothing moves into a solid neighbor.
      if ((solid[c + sx] && x > 0) || (solid[c - sx] && x < 0)) x = 0;
      if ((solid[c + sy] && y > 0) || (solid[c - sy] && y < 0)) y = 0;
      if ((solid[c + sz] && z > 0) || (solid[c - sz] && z < 0)) z = 0;
      const m = Math.hypot(x, y, z);
      if (!(m <= VMAX_CELLS)) {
        const s = Number.isFinite(m) ? VMAX_CELLS / m : 0;
        x *= s; y *= s; z *= s;
      }
      v[c * 3] = x; v[c * 3 + 1] = y; v[c * 3 + 2] = z;
    }
    this.copyBoundary();
    this.stepTemperature();
  }

  // Zero-gradient open boundary: a boundary cell takes its inner neighbor's velocity, so the projection of the next step reads a boundary that is consistent with the interior.
  private copyBoundary(): void {
    const { NX, NY, NZ } = this;
    const { open, solid } = this.scene;
    const v = this.u;
    const stride = [1, NX, NX * NY];
    const dims = [NX, NY, NZ];
    for (let c = 0; c < this.n; c++) {
      if (!open[c]) continue;
      const idx = [c % NX, Math.floor(c / NX) % NY, Math.floor(c / (NX * NY))];
      for (let a = 0; a < 3; a++) {
        if (idx[a] !== 0 && idx[a] !== dims[a] - 1) continue;
        const inner = c + (idx[a] === 0 ? 1 : -1) * stride[a];
        const ii = [inner % NX, Math.floor(inner / NX) % NY, Math.floor(inner / (NX * NY))];
        if (solid[inner] || ii.some((x, ax) => x === 0 || x === dims[ax] - 1)) break;
        v[c * 3] = v[inner * 3]; v[c * 3 + 1] = v[inner * 3 + 1]; v[c * 3 + 2] = v[inner * 3 + 2];
        break;
      }
    }
  }

  /** Carries the temperature with the final velocity, warms it in the heat cells and holds room air and the open boundary at zero. */
  private stepTemperature(): void {
    const { NX, NY, NZ } = this;
    const { solid, open, heat } = this.scene;
    const v = this.u;
    const t = this.t;
    const out = this.tNext;
    for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const c = i + NX * (j + NY * k);
      const id = heat[c];
      if (solid[c] || open[c] || id === SOURCE_ROOM) { out[c] = 0; continue; }
      let r = this.sampleScalar(t, i - v[c * 3], j - v[c * 3 + 1], k - v[c * 3 + 2]);
      // Diffusion: close a small share of the gap to the mean of the fluid neighbors, as the temperature pass does.
      let acc = 0;
      let cnt = 0;
      for (let a = 0; a < 6; a++) {
        const ni = i + (a === 0 ? 1 : a === 1 ? -1 : 0);
        const nj = j + (a === 2 ? 1 : a === 3 ? -1 : 0);
        const nk = k + (a === 4 ? 1 : a === 5 ? -1 : 0);
        if (ni < 0 || nj < 0 || nk < 0 || ni >= NX || nj >= NY || nk >= NZ) continue;
        const nc = ni + NX * (nj + NY * nk);
        if (solid[nc]) continue;
        acc += t[nc];
        cnt++;
      }
      if (cnt > 0) r += TEMP_DIFFUSION * (acc / cnt - r);
      const power = this.powerRise[id];
      const src = this.rises[id];
      // Power heats the air, but never past the part's own temperature when it is known, nor past the cap.
      if (power >= 0) r = Math.min(src >= 0 ? Math.min(MAX_RISE_K, src) : MAX_RISE_K, r + power);
      else if (src >= 0) r = heatStep(r, src, 1);
      out[c] = r;
    }
    this.tNext = t;
    this.t = out;
  }

  /** Largest velocity magnitude over fluid cells, cells per step; NaN if any component is not finite. */
  maxSpeed(): number {
    let m = 0;
    for (let c = 0; c < this.n; c++) {
      if (this.scene.solid[c]) continue;
      const s = Math.hypot(this.u[c * 3], this.u[c * 3 + 1], this.u[c * 3 + 2]);
      if (!Number.isFinite(s)) return NaN;
      if (s > m) m = s;
    }
    return m;
  }
}
