import { describe, expect, it } from 'vitest';
import type { SceneObject } from '../../api/lightingScene';
import type { PcSetup } from '../../api/pcSetup';
import { applyPlacements, isMovable } from './setupPlacement';

const obj = (id: string, kind: string, x: number, z: number, yaw = 0): SceneObject => ({
  id, kind, source: 'build', position: [x, 0, z], yaw, size: [100, 20, 100], anchors: [],
});
const setup = (ids: string[], objects: SceneObject[]): PcSetup => ({
  version: 1, case: {}, items: ids.map(id => ({ id, kind: 'desk', owned: true })), resolved: { objects },
});

describe('desk parts', () => {
  const desk = obj('desk-1', 'desk', 0, 0);
  const wing = obj('desk-1.return', 'desk', 1000, 0);
  const kb = obj('kb-1', 'keyboard', 10, 20);

  it('keeps the desk and its return wing out of what Lighting may move', () => {
    const s = setup(['desk-1', 'kb-1'], [desk, wing, kb]);
    expect(isMovable(s, 1, desk)).toBe(false);
    expect(isMovable(s, 1, wing)).toBe(false);
    expect(isMovable(s, 1, kb)).toBe(true);
  });

  it('moves only the placed object', () => {
    const [d, w, k] = applyPlacements([desk, wing, kb], [{ id: 'kb-1', x: 50, z: -20, yaw: 90 }]);
    expect(d).toBe(desk);
    expect(w).toBe(wing);
    expect(k.position).toEqual([50, 0, -20]);
    expect(k.yaw).toBe(90);
  });
});
