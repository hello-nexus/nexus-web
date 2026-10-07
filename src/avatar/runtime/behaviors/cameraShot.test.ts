import { describe, expect, it } from 'vitest';
import { Object3D, PerspectiveCamera, Vector3 } from 'three';
import { CameraController } from './cameraController';

describe('CameraController shotNode', () => {
  it('blends the camera toward the node world pose by its scale.x and ignores zoom while it holds', () => {
    const target = new Object3D();
    target.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);
    const shot = new Object3D();
    shot.name = 'Shot';
    shot.position.set(1, 2, 3);
    shot.scale.setScalar(0);
    target.add(shot);
    target.updateMatrixWorld(true);
    const camera = new PerspectiveCamera(45, 0.5, 0.1, 100);
    const controller = new CameraController(camera, target, document.createElement('div'), { shotNode: 'Shot' });
    const shotWorld = new Vector3(-1, 2, -3);

    controller.update(0.016);
    const rigPos = camera.position.clone();
    expect(rigPos.distanceTo(shotWorld)).toBeGreaterThan(0.5);

    shot.scale.setScalar(1);
    controller.update(0.016);
    expect(camera.position.distanceTo(shotWorld)).toBeLessThan(1e-6);
    expect(Math.abs(camera.quaternion.dot(target.quaternion))).toBeGreaterThan(1 - 1e-6);

    const zoom = controller.getZoomFraction();
    controller.setZoomFraction(zoom > 0.5 ? 0 : 1);
    expect(controller.getZoomFraction()).toBe(zoom);

    shot.scale.setScalar(0.5);
    controller.update(0.016);
    expect(camera.position.distanceTo(rigPos.clone().lerp(shotWorld, 0.5))).toBeLessThan(1e-6);
    expect(camera.quaternion.length()).toBeGreaterThan(0.999);
  });
});
