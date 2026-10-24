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

describe('desk return wing', () => {
  const desk = obj('desk-1', 'desk', 0, 0);
  const wing = obj('desk-1.return', 'desk', 1000, 0);

  it('is not movable on its own while the desk is', () => {
    const s = setup(['desk-1'], [desk, wing]);
    expect(isMovable(s, 1, desk)).toBe(true);
    expect(isMovable(s, 1, wing)).toBe(false);
  });

  it('follows a move of the desk', () => {
    const [d, w] = applyPlacements([desk, wing], [{ id: 'desk-1', x: 50, z: -20, yaw: 0 }]);
    expect(d.position).toEqual([50, 0, -20]);
    expect(w.position).toEqual([1050, 0, -20]);
  });

  it('swings around the desk on a turn', () => {
    const [, w] = applyPlacements([desk, wing], [{ id: 'desk-1', x: 0, z: 0, yaw: 90 }]);
    expect(w.position[0]).toBeCloseTo(0);
    expect(w.position[2]).toBeCloseTo(-1000);
    expect(w.yaw).toBe(90);
  });
});
