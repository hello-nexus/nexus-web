// @vitest-environment node
import { readFileSync } from 'node:fs';
import { Box3, Group, Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Y70_FAN_SLOTS, Y70_SIZE } from '../cooling/y70Slots.fixture';
import { parseCaseModel, sceneToLayoutMatrix } from './caseModel';

// The case model T1's service served for the HYTE Y70 (Build's export), and that case's fan slots from the same setup record.
const load = async () => {
  const buf = readFileSync(new URL('../cooling/__fixtures__/y70-case.glb', import.meta.url));
  return parseCaseModel(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
};

async function inLayout(windowRight = false) {
  const model = await load();
  const holder = new Group();
  holder.applyMatrix4(sceneToLayoutMatrix(Y70_SIZE as [number, number, number], windowRight));
  holder.add(model);
  holder.updateMatrixWorld(true);
  return holder;
}

describe('sceneToLayoutMatrix', () => {
  it('is the exact inverse of the bake Build applies', () => {
    const [D, W] = [470, 320];
    for (const sx of [1, -1]) {
      const bake = new Matrix4().set(0, 0, sx, (-sx * W) / 2, 0, 1, 0, 0, -1, 0, 0, D / 2, 0, 0, 0, 1);
      const back = sceneToLayoutMatrix([D, W, 487], sx === -1);
      for (const p of [[10, 20, 30], [470, 0, 320], [-5, 487, 12]]) {
        const v = new Vector3(...p).applyMatrix4(bake).applyMatrix4(back);
        expect(v.distanceTo(new Vector3(...p))).toBeLessThan(1e-9);
      }
    }
  });
});

describe('the Y70 model in the layout frame', () => {
  it('lies inside the case box and matches its depth', async () => {
    const box = new Box3().setFromObject(await inLayout());
    const [D, W, H] = Y70_SIZE;
    expect(box.min.x).toBeGreaterThan(-5);
    expect(box.max.x).toBeLessThan(D + 5);
    expect(box.min.y).toBeGreaterThan(-5);
    expect(box.max.y).toBeLessThan(H + 5);
    expect(box.min.z).toBeGreaterThan(-5);
    expect(box.max.z).toBeLessThan(W + 5);
    expect(Math.abs(box.max.x - box.min.x - D)).toBeLessThan(8);
  });

  it('puts a model panel within a few mm of the outer face of every fan mount', async () => {
    const holder = await inLayout();
    const planes: { axis: number; at: number; lo: number[]; hi: number[] }[] = [];
    holder.traverse(o => {
      if (!(o as { isMesh?: boolean }).isMesh) return;
      const b = new Box3().setFromObject(o);
      const size = b.getSize(new Vector3()).toArray();
      for (let axis = 0; axis < 3; axis++) {
        if (size[axis] <= 3) planes.push({ axis, at: (b.min.getComponent(axis) + b.max.getComponent(axis)) / 2, lo: b.min.toArray(), hi: b.max.toArray() });
      }
    });
    const gaps: number[] = [];
    for (const s of Y70_FAN_SLOTS) {
      const axis = s.axis.findIndex(v => v !== 0);
      const outer = s.axis[axis] > 0 ? s.box.min[axis] : s.box.min[axis] + s.box.size[axis];
      const center = s.box.min.map((m, i) => m + s.box.size[i] / 2);
      const covering = planes.filter(p => p.axis === axis && [0, 1, 2].every(i => i === axis || (center[i] >= p.lo[i] - 1 && center[i] <= p.hi[i] + 1)));
      const gap = Math.min(...covering.map(p => Math.abs(p.at - outer)));
      expect(Number.isFinite(gap)).toBe(true);
      gaps.push(gap);
    }
    // Every mount of a face sits the same distance from that face's panel (a rigid fit, not a per-fan drift), and within 15 mm of it.
    const byFace = new Map<string, number[]>();
    Y70_FAN_SLOTS.forEach((s, i) => byFace.set(s.position, [...(byFace.get(s.position) ?? []), gaps[i]]));
    for (const [, g] of byFace) expect(Math.max(...g) - Math.min(...g)).toBeLessThan(0.5);
    expect(Math.max(...gaps)).toBeLessThan(15);
  });
});
