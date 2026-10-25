import { PARTICLE_BIRTH_SPREAD, PARTICLE_LIFE_JITTER, PARTICLE_MAX_AGE, PARTICLE_SPEED_SCALE, STUCK_AGE_RATE, STUCK_MOVE_CELLS, substepsFor } from './flowParams';
import type { CpuFlow } from './cpuSolver';
import { sampleSpawn } from './gridScene';

/** A particle's lifetime in steps from a uniform sample. */
export const lifeOf = (u: number) => PARTICLE_MAX_AGE * (1 - PARTICLE_LIFE_JITTER + 2 * PARTICLE_LIFE_JITTER * u);

/** CPU reference of the GPU particle pass: RK2 advection through the velocity field, per-axis sliding so a particle never enters a solid, respawn at the spawn points. */
export class CpuParticles {
  readonly pos: Float32Array;
  readonly age: Float32Array;
  readonly heat: Float32Array;
  readonly count: number;
  private readonly flow: CpuFlow;
  /** Respawns so far, for checks on how evenly particles are recycled. */
  respawns = 0;
  /** Per-particle lifetime in steps. */
  readonly life: Float32Array;
  private seed: number;

  constructor(flow: CpuFlow, count: number, seed = 1, jitter = true) {
    this.flow = flow;
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.age = new Float32Array(count);
    this.heat = new Float32Array(count);
    this.life = new Float32Array(count);
    this.seed = seed;
    for (let i = 0; i < count; i++) {
      this.life[i] = jitter ? lifeOf(this.rand()) : PARTICLE_MAX_AGE;
      this.respawn(i);
      this.respawns--;
      this.age[i] = -this.rand() * PARTICLE_MAX_AGE * PARTICLE_BIRTH_SPREAD;
    }
  }

  private rand(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  private respawn(i: number) {
    this.age[i] = 0;
    this.heat[i] = 0;
    this.respawns++;
    const q = sampleSpawn(this.flow.scene, () => this.rand());
    if (!q) { this.pos[i * 3] = -1e6; return; }
    this.pos[i * 3] = q[0]; this.pos[i * 3 + 1] = q[1]; this.pos[i * 3 + 2] = q[2];
  }

  /** Cell index holding cell-coordinate point (x, y, z), or -1 outside the domain. */
  cellAt(x: number, y: number, z: number): number {
    const [NX, NY, NZ] = this.flow.scene.dims;
    const i = Math.floor(x + 0.5), j = Math.floor(y + 0.5), k = Math.floor(z + 0.5);
    if (i < 0 || j < 0 || k < 0 || i >= NX || j >= NY || k >= NZ) return -1;
    return i + NX * (j + NY * k);
  }

  private inCase(x: number, y: number, z: number): boolean {
    const { min, max } = this.flow.scene.caseBounds;
    return x >= min[0] && x <= max[0] && y >= min[1] && y <= max[1] && z >= min[2] && z <= max[2];
  }

  /** Advances every particle one step. `onMove(i, fromCell, toCell)` sees each move that changes cell. */
  step(onMove?: (i: number, from: number, to: number) => void, speed: number = PARTICLE_SPEED_SCALE): void {
    const { solid, open, heat } = this.flow.scene;
    const v = [0, 0, 0];
    for (let i = 0; i < this.count; i++) {
      const o = i * 3;
      if (this.pos[o] < -1e5) { this.respawn(i); continue; }
      if (this.age[i] < 0) { this.age[i] += 1; continue; }
      let x = this.pos[o], y = this.pos[o + 1], z = this.pos[o + 2];
      const from = this.cellAt(x, y, z);
      // Positions live in float32, so test the rounded point: a double just below a cell edge can round onto it.
      const tryMove = (nx: number, ny: number, nz: number) => {
        nx = Math.fround(nx); ny = Math.fround(ny); nz = Math.fround(nz);
        const c = this.cellAt(nx, ny, nz);
        if (c < 0 || solid[c]) return false;
        x = nx; y = ny; z = nz;
        return true;
      };
      const subs = substepsFor(speed);
      const h = speed / subs;
      const x0 = x, y0 = y, z0 = z;
      for (let k = 0; k < subs; k++) {
        this.flow.sample(x, y, z, v);
        this.flow.sample(x + 0.5 * h * v[0], y + 0.5 * h * v[1], z + 0.5 * h * v[2], v);
        tryMove(x + h * v[0], y, z);
        tryMove(x, y + h * v[1], z);
        tryMove(x, y, z + h * v[2]);
        const c = this.cellAt(x, y, z);
        if (open[c]) break;
      }
      this.pos[o] = x; this.pos[o + 1] = y; this.pos[o + 2] = z;
      this.age[i] += Math.hypot(x - x0, y - y0, z - z0) < STUCK_MOVE_CELLS * speed ? STUCK_AGE_RATE : 1;
      const cell = this.cellAt(x, y, z);
      if (cell !== from) onMove?.(i, from, cell);
      this.heat[i] = Math.min(1, this.heat[i] + heat[cell] * speed);
      if (open[cell] || this.age[i] > this.life[i] || !this.inCase(x, y, z)) this.respawn(i);
    }
  }
}
