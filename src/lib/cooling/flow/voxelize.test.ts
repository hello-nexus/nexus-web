// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { CaseBox, Vec3 } from '../caseLayout';
import { boxBounds, boxContains } from './voxelize';
import { buildFlowScene } from './gridScene';
import { inputFor, layoutOf, slotSpec } from './flowFixtures';

const STEP = 2;

/** Volume of a shape by dense point sampling of its bounds. */
function sampledVolume(box: CaseBox): number {
  const b = boxBounds(box, 1);
  let n = 0;
  for (let x = b.min[0]; x < b.max[0]; x += STEP) for (let y = b.min[1]; y < b.max[1]; y += STEP) for (let z = b.min[2]; z < b.max[2]; z += STEP) {
    if (boxContains(box, [x + STEP / 2 + 0.31, y + STEP / 2 + 0.17, z + STEP / 2 + 0.23], 0)) n++;
  }
  return n * STEP ** 3;
}

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol * b;

describe('boxContains: the shape Build draws', () => {
  it('a turned box is the rotated rectangle, in three.js turn direction', () => {
    const box: CaseBox = { slot: 'gpu', role: 'part', min: [100, 100, 100], size: [200, 40, 80], rotationY: 0.6 };
    expect(near(sampledVolume(box), 200 * 40 * 80, 0.03)).toBe(true);
    // A corner of the unturned rectangle is outside once turned; the turned corner is inside.
    const c: Vec3 = [200, 120, 140];
    const cos = Math.cos(0.6), sin = Math.sin(0.6);
    const turned = (lx: number, lz: number): Vec3 => [200 + lx * cos + lz * sin, 120, 140 - lx * sin + lz * cos];
    expect(boxContains(box, turned(95, 0), 0)).toBe(true);
    expect(boxContains(box, turned(105, 0), 0)).toBe(false);
    expect(boxContains(box, turned(0, 38), 0)).toBe(true);
    expect(boxContains(box, turned(0, 42), 0)).toBe(false);
    expect(boxContains(box, [100.5, 100.5, 100.5], 0)).toBe(false);
    void c;
  });

  it('a chamfered box loses exactly the cut prism', () => {
    const size: Vec3 = [200, 100, 60];
    const box: CaseBox = {
      slot: 'psu', role: 'part', min: [0, 0, 0], size,
      chamfers: [{ a: 0, aMax: true, b: 1, bMax: true, legA: 40, legB: 30 }],
    };
    // Triangle with legs legA (along face a) and legB (along face b), extruded along z.
    const expected = size[0] * size[1] * size[2] - (40 * 30 / 2) * size[2];
    expect(near(sampledVolume(box), expected, 0.01)).toBe(true);
    expect(boxContains(box, [199, 99, 30], 0)).toBe(false);
    expect(boxContains(box, [199, 40, 30], 0)).toBe(true);
    expect(boxContains(box, [100, 99, 30], 0)).toBe(true);
  });

  it('a rounded chamfer removes less than the flat cut and more than nothing', () => {
    const base: CaseBox = { slot: 'psu', role: 'part', min: [0, 0, 0], size: [200, 100, 60], chamfers: [{ a: 0, aMax: true, b: 1, bMax: true, legA: 40, legB: 40 }] };
    const rounded: CaseBox = { ...base, chamfers: [{ ...base.chamfers![0], round: true }] };
    const full = 200 * 100 * 60;
    expect(sampledVolume(rounded)).toBeLessThan(full);
    expect(sampledVolume(rounded)).toBeGreaterThan(sampledVolume(base));
  });

  it('a loft follows its rings', () => {
    const sq = (h: number): [number, number][] => [[100 - h, 100 - h], [100 + h, 100 - h], [100 + h, 100 + h], [100 - h, 100 + h]];
    const box: CaseBox = { slot: 'psu', role: 'part', min: [50, 0, 50], size: [100, 90, 100], rings: [{ y: 0, pts: sq(50) }, { y: 90, pts: sq(20) }] };
    // Frustum: h/3 * (A1 + A2 + sqrt(A1 A2)).
    const a1 = 100 * 100, a2 = 40 * 40;
    expect(near(sampledVolume(box), (90 / 3) * (a1 + a2 + Math.sqrt(a1 * a2)), 0.03)).toBe(true);
    expect(boxContains(box, [100, 85, 100], 0)).toBe(true);
    expect(boxContains(box, [55, 85, 55], 0)).toBe(false);
  });

  it('a closed solid of faces is its enclosed volume, and a turned one turns with it', () => {
    const layout = layoutOf([], []);
    void layout;
    const faces: Vec3[][] = [
      [[0, 0, 0], [0, 80, 0], [0, 80, 50], [0, 0, 50]], [[120, 0, 0], [120, 0, 50], [120, 80, 50], [120, 80, 0]],
      [[0, 0, 0], [0, 0, 50], [120, 0, 50], [120, 0, 0]], [[0, 80, 0], [120, 80, 0], [120, 80, 50], [0, 80, 50]],
      [[0, 0, 0], [120, 0, 0], [120, 80, 0], [0, 80, 0]], [[0, 0, 50], [0, 80, 50], [120, 80, 50], [120, 0, 50]],
    ];
    const box: CaseBox = { slot: 'psu', role: 'structure', min: [0, 0, 0], size: [120, 80, 50], faces };
    expect(near(sampledVolume(box), 120 * 80 * 50, 0.02)).toBe(true);
    expect(near(sampledVolume({ ...box, rotationY: 0.9 }), 120 * 80 * 50, 0.03)).toBe(true);
  });

  it('a plate keeps its outline and drops its holes', () => {
    const box: CaseBox = {
      slot: 'psu', role: 'part', min: [0, 0, 0], size: [100, 4, 100],
      plate: { normal: 1, outline: [[0, 0], [100, 0], [100, 100], [0, 100]], holes: [[[40, 40], [60, 40], [60, 60], [40, 60]]] },
    };
    expect(near(sampledVolume(box), (100 * 100 - 20 * 20) * 4, 0.05)).toBe(true);
    expect(boxContains(box, [50, 2, 50], 0)).toBe(false);
    expect(boxContains(box, [10, 2, 10], 0)).toBe(true);
  });

  it('counts a part thinner than the minimum thickness as that thick', () => {
    const board: CaseBox = { slot: 'motherboard', role: 'part', min: [10, 10, 10], size: [200, 1.6, 200] };
    expect(boxContains(board, [100, 10.8 + 4, 100], 10)).toBe(true);
    expect(boxContains(board, [100, 10.8 + 6, 100], 10)).toBe(false);
  });
});

describe('the grid solids match the drawn parts', () => {
  it('a turned GPU and a chamfered PSU fill the cells their shapes cover, and nothing else', () => {
    const gpu = { slot: 'gpu', role: 'part', min: [150, 150, 100], size: [200, 40, 80], rotationY: 0.5 };
    const psu = { slot: 'psu', role: 'part', min: [30, 20, 200], size: [150, 90, 120], chamfers: [{ a: 0, aMax: true, b: 1, bMax: true, legA: 60, legB: 50 }] };
    const scene = buildFlowScene(inputFor([slotSpec('front:120:0', 'front', 'fan', [0, 200, 120], [25, 120, 120], [1, 0, 0])], [gpu, psu], () => 'intake'), 64 * 48 * 96);
    const h = scene.cellMm;
    const [NX, NY] = scene.dims;
    let gpuCells = 0, psuCells = 0, stray = 0;
    const inGpu = (p: Vec3) => boxContains(gpu as CaseBox, p, h);
    const inPsu = (p: Vec3) => boxContains(psu as CaseBox, p, h);
    for (let c = 0; c < scene.solid.length; c++) {
      if (!scene.solid[c]) continue;
      const i = c % NX, j = Math.floor(c / NX) % NY, k = Math.floor(c / (NX * NY));
      const inside = i > scene.caseMin[0] && i < scene.caseMax[0] && j > scene.caseMin[1] && j < scene.caseMax[1] && k > scene.caseMin[2] && k < scene.caseMax[2];
      if (!inside) continue;
      const p: Vec3 = [(i + 0.5) * h - scene.origin[0], (j + 0.5) * h - scene.origin[1], (k + 0.5) * h - scene.origin[2]];
      if (inGpu(p)) gpuCells++; else if (inPsu(p)) psuCells++; else stray++;
    }
    expect(stray).toBe(0);
    // Thin sides are padded to one cell, so the solid is within one cell of the true volume on each thin axis.
    const gpuTrue = 200 * 40 * 80 / h ** 3;
    const psuTrue = (150 * 90 - 60 * 50 / 2) * 120 / h ** 3;
    expect(gpuCells).toBeGreaterThan(gpuTrue * 0.85);
    expect(gpuCells).toBeLessThan(gpuTrue * 1.5);
    expect(psuCells).toBeGreaterThan(psuTrue * 0.85);
    expect(psuCells).toBeLessThan(psuTrue * 1.3);
  });

  it('reports the cell size at the finest tier, against a 40 mm GPU and a 12 mm gap', () => {
    const scene = buildFlowScene(inputFor([slotSpec('front:120:0', 'front', 'fan', [0, 200, 120], [25, 120, 120], [1, 0, 0])], [], () => 'intake'), 64 * 48 * 96);
    expect(scene.cellMm).toBeLessThan(40 / 3);
    expect(scene.dims[0] * scene.dims[1] * scene.dims[2]).toBeLessThan(400000);
  });
});
