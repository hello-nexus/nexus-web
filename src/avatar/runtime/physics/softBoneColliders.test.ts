import { describe, expect, it } from 'vitest';
import { Object3D, Vector3 } from 'three';
import { PlaneSoftBoneCollider } from './softBoneColliders';

describe('PlaneSoftBoneCollider', () => {
  it('pushes a node in front of the wall back behind it and leaves nodes behind alone', () => {
    const hip = new Object3D();
    hip.position.set(0, 1, 0);
    hip.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
    hip.updateMatrixWorld(true);
    const wall = new PlaneSoftBoneCollider(hip, [0, 0, 0], [0, 0, 1]);
    wall.updateWorld();
    // Local +Z maps to world +X under the yaw.
    const front = new Vector3(0.3, 1, 0);
    wall.collide(front, 0.02);
    expect(front.x).toBeCloseTo(-0.02, 6);
    const behind = new Vector3(-0.2, 0.5, 0.1);
    wall.collide(behind, 0.02);
    expect(behind.toArray()).toEqual([-0.2, 0.5, 0.1]);
  });
});
