// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCaseLayout, type CaseLayout } from '../caseLayout';
import { buildFlowScene, type FlowInput, type FlowScene } from './gridScene';
import { obstaclesOf } from './obstacles';
import { boxContains } from './voxelize';

// The HYTE Y70's case layout as T1's service returned it (Build's resolved.caseLayout), with no fan or GPU in it.
const raw = JSON.parse(readFileSync(new URL('../__fixtures__/y70-case-layout.json', import.meta.url), 'utf8')) as Record<string, unknown>;
const y70 = (extra: unknown[] = [], slots: unknown[] = raw.fanSlots as unknown[]): CaseLayout => parseCaseLayout({ ...raw, boxes: [...(raw.boxes as unknown[]), ...extra], fanSlots: slots }) as CaseLayout;
const MID = 64 * 48 * 96;

const input = (layout: CaseLayout, fans: Record<string, number> = {}): FlowInput => {
  const directions: Record<string, 'intake' | 'exhaust'> = {};
  for (const s of layout.fanSlots) directions[s.key] = s.position === 'rear' || s.position === 'top' ? 'exhaust' : 'intake';
  return { layout, directions, fanCfm: fans, ventCfm: 0 };
};

const at = (s: FlowScene, mm: number[]) => {
  const [NX, NY] = s.dims;
  const i = Math.floor((mm[0] + s.origin[0]) / s.cellMm), j = Math.floor((mm[1] + s.origin[1]) / s.cellMm), k = Math.floor((mm[2] + s.origin[2]) / s.cellMm);
  return i + NX * (j + NY * k);
};

describe('the Y70 obstacle set', () => {
  const layout = y70();
  const obstacles = obstaclesOf(layout);

  it('is the case plates, the tray, the PSU and the shroud, and leaves out small parts', () => {
    const kinds = obstacles.map(o => `${o.box.slot}:${o.kind}`);
    expect(kinds.filter(k => k === 'psu:psu')).toHaveLength(1);
    expect(kinds.filter(k => k === 'motherboard:board')).toHaveLength(1);
    expect(kinds.some(k => k.startsWith('ram') || k.startsWith('storage') || k.startsWith('cpu'))).toBe(false);
    expect(obstacles.some(o => o.porous && o.box.slot === 'cooler')).toBe(true);
    // The divider plate: a z-normal plate spanning the case height, with its cutouts.
    const divider = obstacles.find(o => o.box.plate?.normal === 2 && o.box.size[1] > 400);
    expect(divider?.box.plate?.holes.length).toBeGreaterThan(0);
    // The shroud's closed solids.
    expect(obstacles.some(o => o.box.faces && o.kind === 'panel')).toBe(true);
    // Walls are the grid's own shell, small details and feet are left out.
    expect(obstacles.some(o => o.box.plate?.wall)).toBe(false);
    expect(obstacles.some(o => o.box.rings)).toBe(false);
    expect(obstacles.every(o => o.box.role !== 'detail')).toBe(true);
  });

  it('puts every obstacle in the grid and lists exactly those in the scene', () => {
    const scene = buildFlowScene(input(layout), MID);
    expect(scene.obstacles).toEqual(obstacles);
  });
});

describe('the Y70 chambers', () => {
  const scene = buildFlowScene(input(y70()), MID);
  const divider = scene.obstacles.find(o => o.box.plate?.normal === 2 && o.box.size[1] > 400)!.box;
  const [NX, NY, NZ] = scene.dims;
  const dividerK = Math.floor((divider.min[2] + scene.origin[2]) / scene.cellMm);

  it('makes the divider solid except at its cutouts', () => {
    let inside = 0, solidInside = 0, fluidInside = 0, mismatch = 0;
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const p = [(i + 0.5) * scene.cellMm - scene.origin[0], (j + 0.5) * scene.cellMm - scene.origin[1], divider.min[2]];
      const c = i + NX * (j + NY * dividerK);
      const covered = boxContains(divider, p, scene.cellMm);
      const outline = p[0] >= divider.min[0] && p[0] <= divider.min[0] + divider.size[0] && p[1] >= divider.min[1] && p[1] <= divider.min[1] + divider.size[1];
      if (!outline) continue;
      inside++;
      if (scene.solid[c]) solidInside++; else fluidInside++;
      if (covered !== (scene.solid[c] === 1)) mismatch++;
    }
    expect(solidInside).toBeGreaterThan(inside * 0.6);
    expect(fluidInside).toBeGreaterThan(0);
    // Other parts overlap the plate in a few cells; the plate's own cells agree.
    expect(mismatch).toBeLessThan(inside * 0.06);
  });

  /** Cells reachable from `from` through fluid cells. */
  const reach = (s: FlowScene, from: number): Set<number> => {
    const seen = new Set([from]);
    const stack = [from];
    while (stack.length) {
      const c = stack.pop()!;
      const i = c % NX, j = Math.floor(c / NX) % NY, k = Math.floor(c / (NX * NY));
      for (const [di, dj, dk] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const ni = i + di, nj = j + dj, nk = k + dk;
        if (ni < 0 || nj < 0 || nk < 0 || ni >= NX || nj >= NY || nk >= NZ) continue;
        const n = ni + NX * (nj + NY * nk);
        if (!s.solid[n] && !seen.has(n)) { seen.add(n); stack.push(n); }
      }
    }
    return seen;
  };

  it('lets air cross between the chambers only through the divider\'s cutouts', () => {
    const front = at(scene, [260, 300, 120]);
    const rearCell = at(scene, [400, 420, 290]);
    expect(scene.solid[front]).toBe(0);
    expect(scene.solid[rearCell]).toBe(0);
    const open = reach(scene, front);
    expect(open.has(rearCell)).toBe(true);
    // Every cell of the divider layer the air visited lies in a cutout.
    for (const c of open) {
      if (Math.floor(c / (NX * NY)) !== dividerK) continue;
      const i = c % NX, j = Math.floor(c / NX) % NY;
      const p = [(i + 0.5) * scene.cellMm - scene.origin[0], (j + 0.5) * scene.cellMm - scene.origin[1], divider.min[2]];
      const outline = p[0] >= divider.min[0] && p[0] <= divider.min[0] + divider.size[0] && p[1] >= divider.min[1] && p[1] <= divider.min[1] + divider.size[1];
      if (outline) expect(boxContains(divider, p, scene.cellMm)).toBe(false);
    }
    // With every cutout closed, the rear chamber is unreachable.
    const sealed: FlowScene = { ...scene, solid: Uint8Array.from(scene.solid) };
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) sealed.solid[i + NX * (j + NY * dividerK)] = 1;
    expect(reach(sealed, front).has(rearCell)).toBe(false);
  });
});

describe('a vertical GPU on the Y70', () => {
  // RTX 5080 Founders Edition: 304 mm long, two slots, standing on its riser in the window chamber: card height along x, length along y, thickness along z.
  const gpu = { slot: 'gpu', role: 'part', min: [150, 150, 12], size: [125, 304, 40], fans: { axis: 'z', diameter: 90 } };
  const scene = buildFlowScene(input(y70([gpu])), MID);

  it('is one solid box of its own size, with the card\'s thin side along z', () => {
    const obstacle = scene.obstacles.find(o => o.kind === 'gpu')!;
    expect(obstacle.box.size).toEqual([125, 304, 40]);
    expect(scene.solid[at(scene, [210, 300, 30])]).toBe(1);
    expect(scene.solid[at(scene, [210, 300, 80])]).toBe(0);
    expect(scene.solid[at(scene, [140, 300, 30])]).toBe(0);
    const volume = (125 * 304 * 40) / scene.cellMm ** 3;
    let inBox = 0;
    for (let x = 152; x < 275; x += scene.cellMm) for (let y = 152; y < 454; y += scene.cellMm) for (let z = 14; z < 52; z += scene.cellMm) if (scene.solid[at(scene, [x, y, z])]) inBox++;
    expect(inBox).toBeGreaterThan(volume * 0.5);
  });

  it('heats the air next to it', () => {
    expect(scene.heat[at(scene, [210, 300, 60])]).toBeGreaterThan(0);
  });
});

describe('an AIO radiator on the Y70, from synthetic data', () => {
  const cooler = { slot: 'cooler', role: 'part', min: [329, 237, 48], size: [105, 126, 155], fans: { axis: 'x', diameter: 120 } };
  const rad = { key: 'top:360:0', position: 'top', size: 360, index: 0, taken: 'radiator', box: { min: [60, 435, 40], size: [360, 52, 120] }, axis: [0, -1, 0], radiator: { fanCount: 3, fanAirflowCfm: 50 } };
  const scene = buildFlowScene(input(y70([cooler], [rad]), { 'top:360:0': 50, 'top:360:0#1': 50, 'top:360:0#2': 50 }), MID);

  it('is a porous block: it slows air and never stops it', () => {
    expect(scene.darcy[at(scene, [380, 300, 120])]).toBeGreaterThan(0);
    expect(scene.solid[at(scene, [380, 300, 120])]).toBe(0);
    expect(scene.darcy[at(scene, [200, 460, 100])]).toBeGreaterThan(0);
    expect(scene.solid[at(scene, [200, 460, 100])]).toBe(0);
    expect(scene.fanCount).toBe(3);
  });
});

describe('a fan flush with a corner', () => {
  it('opens only the face it points out of', () => {
    const slot = { key: 'top:140:0', position: 'top', size: 140, index: 0, taken: 'fan', box: { min: [0, 462, 0], size: [140, 25, 140] }, axis: [0, -1, 0] };
    const layout = y70([], [slot]);
    const scene = buildFlowScene(input(layout, { 'top:140:0': 60 }), MID);
    const [NX, NY] = scene.dims;
    let opened = 0;
    for (let c = 0; c < scene.opening.length; c++) {
      if (!scene.opening[c]) continue;
      opened++;
      const j = Math.floor(c / NX) % NY;
      expect(j).toBe(scene.caseMax[1]);
    }
    expect(opened).toBeGreaterThan(0);
  });
});
