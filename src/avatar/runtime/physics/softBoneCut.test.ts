import { describe, expect, it } from 'vitest';
import { Object3D, Vector3 } from 'three';
import { SoftBoneSystem, type SoftBoneCurve, type SoftBoneSystemConfig } from './softBoneCore';

const FLAT: SoftBoneCurve = [[0, 1], [1, 1]];

const config: SoftBoneSystemConfig = {
  gravity: [0, 0, 0], iterations: 1, deltaTimeMode: 'variable', constantDeltaTime: 0.03, maxDeltaTime: 0.05,
  maxSubSteps: 4, sleepThreshold: 0.005, startDepth: 0, siblingMode: 'none', closedSiblings: false,
  siblingRotationConstraints: true, radius: 0,
  material: {
    damping: 0.5, dampingCurve: FLAT, stiffness: 0, stiffnessCurve: FLAT,
    resistance: 0, resistanceCurve: FLAT, slackness: 0, slacknessCurve: FLAT,
  },
};

describe('SoftBoneSystem cut', () => {
  it('re-seeds a chain whose root jumps instead of whipping it across the gap', () => {
    const host = new Object3D();
    host.position.set(10, 5, 0);
    const root = new Object3D();
    host.add(root);
    const b1 = new Object3D();
    b1.position.set(0.5, 0, 0);
    root.add(b1);
    const b2 = new Object3D();
    b2.position.set(0.5, 0, 0);
    b1.add(b2);
    const sys = new SoftBoneSystem(host, [root], config);
    for (let i = 0; i < 10; i++) sys.update(0.03);
    host.position.x += 5;
    host.updateMatrixWorld(true);
    sys.update(0.03);
    expect(b1.getWorldPosition(new Vector3()).distanceTo(new Vector3(15.5, 5, 0))).toBeLessThan(0.02);
  });
});
