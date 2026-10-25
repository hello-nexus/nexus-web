import { PARTICLE_MAX_AGE } from './flowParams';
import type { CpuFlow } from './cpuSolver';

/** CPU reference of the GPU particle pass: RK2 advection through the velocity field, per-axis sliding so a particle never enters a solid, respawn at the spawn points. */
export class CpuParticles {
  readonly pos: Float32Array;
  readonly age: Float32Array;
  readonly heat: Float32Array;
  readonly count: number;
  private readonly flow: CpuFlow;
  private seed: number;

  constructor(flow: CpuFlow, count: number, seed = 1) {
    this.flow = flow;
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.age = new Float32Array(count);
    this.heat = new Float32Array(count);
    this.seed = seed;
    for (let i = 0; i < count; i++) {
      this.respawn(i);
      this.age[i] = this.rand() * PARTICLE_MAX_AGE;
    }
  }

  private rand(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  private respawn(i: number) {
    const s = this.flow.scene.spawns;
    const n = s.length / 3;
    this.age[i] = 0;
    this.heat[i] = 0;
    if (n === 0) { this.pos[i * 3] = -1e6; return; }
    const m = Math.floor(this.rand() * n);
    this.pos[i * 3] = s[m * 3]; this.pos[i * 3 + 1] = s[m * 3 + 1]; this.pos[i * 3 + 2] = s[m * 3 + 2];
  }

  /** Cell index holding cell-coordinate point (x, y, z), or -1 outside the domain. */
  cellAt(x: number, y: number, z: number): number {
    const [NX, NY, NZ] = this.flow.scene.dims;
    const i = Math.floor(x + 0.5), j = Math.floor(y + 0.5), k = Math.floor(z + 0.5);
    if (i < 0 || j < 0 || k < 0 || i >= NX || j >= NY || k >= NZ) return -1;
    return i + NX * (j + NY * k);
  }

  /** Advances every particle one step. `onMove(i, fromCell, toCell)` sees each move that changes cell. */
  step(onMove?: (i: number, from: number, to: number) => void): void {
    const { solid, open, heat } = this.flow.scene;
    const v = [0, 0, 0];
    for (let i = 0; i < this.count; i++) {
      const o = i * 3;
      if (this.pos[o] < -1e5) { this.respawn(i); continue; }
      const px = this.pos[o], py = this.pos[o + 1], pz = this.pos[o + 2];
      this.flow.sample(px, py, pz, v);
      this.flow.sample(px + 0.5 * v[0], py + 0.5 * v[1], pz + 0.5 * v[2], v);
      let x = px, y = py, z = pz;
      const from = this.cellAt(x, y, z);
      // Positions live in float32, so test the rounded point: a double just below a cell edge can round onto it.
      const tryMove = (nx: number, ny: number, nz: number) => {
        nx = Math.fround(nx); ny = Math.fround(ny); nz = Math.fround(nz);
        const c = this.cellAt(nx, ny, nz);
        if (c < 0 || solid[c]) return false;
        x = nx; y = ny; z = nz;
        return true;
      };
      tryMove(x + v[0], y, z);
      tryMove(x, y + v[1], z);
      tryMove(x, y, z + v[2]);
      this.pos[o] = x; this.pos[o + 1] = y; this.pos[o + 2] = z;
      this.age[i] += 1;
      const cell = this.cellAt(x, y, z);
      if (cell !== from) onMove?.(i, from, cell);
      this.heat[i] = Math.min(1, this.heat[i] + heat[cell]);
      if (open[cell] || this.age[i] > PARTICLE_MAX_AGE) this.respawn(i);
    }
  }
}
