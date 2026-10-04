import { describe, expect, it } from 'vitest';
import { layoutToScene, layoutToSceneMatrix } from './layoutFrame';
import type { Vec3 } from './sceneTypes';

const apply = (m: number[], p: Vec3): Vec3 => [0, 1, 2].map(r => m[r * 4] * p[0] + m[r * 4 + 1] * p[1] + m[r * 4 + 2] * p[2] + m[r * 4 + 3]) as Vec3;

describe('layoutToScene', () => {
  const size: Vec3 = [470, 320, 487];

  it('puts the footprint centre at the origin and the window at -X', () => {
    const frame = layoutToScene({ size });
    expect(frame.point([235, 0, 160])).toEqual([0, 0, 0]);
    expect(frame.point([0, 0, 0])[0]).toBeLessThan(0);
    expect(frame.window).toEqual([-1, 0, 0]);
  });

  it('mirrors a right-window case so its glass lands at +X', () => {
    expect(layoutToScene({ size, windowRight: true }).window).toEqual([1, 0, 0]);
  });

  it('matches the matrix the renderer draws shapes with', () => {
    for (const windowRight of [false, true]) {
      const frame = layoutToScene({ size, windowRight });
      const m = layoutToSceneMatrix({ size, windowRight });
      for (const p of [[0, 0, 0], [470, 487, 320], [12, 300, 77]] as Vec3[]) {
        expect(apply(m, p).map(v => v + 0)).toEqual(frame.point(p).map(v => v + 0));
      }
    }
  });
});
