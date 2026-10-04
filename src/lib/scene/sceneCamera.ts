import { PerspectiveCamera, Vector3 } from 'three';
import type { SceneCamera, Vec3 } from './sceneTypes';
import { CANVAS_H, CANVAS_W } from './sceneMath';

export const CAMERA_NEAR = 1;
export const CAMERA_FAR = 100_000;

/** A three.js camera seeing exactly what the service's SceneCameraBasis projects onto the canvas. */
export function makeCamera(cam: SceneCamera): PerspectiveCamera {
  const camera = new PerspectiveCamera(cam.fov, CANVAS_W / CANVAS_H, CAMERA_NEAR, CAMERA_FAR);
  applyCamera(camera, cam);
  return camera;
}

export function applyCamera(camera: PerspectiveCamera, cam: SceneCamera): void {
  camera.fov = cam.fov;
  camera.aspect = CANVAS_W / CANVAS_H;
  camera.position.set(...cam.position);
  camera.lookAt(new Vector3(...cam.target));
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

/** Canvas-unit position of a world point, or null behind the camera. */
export function projectToCanvas(camera: PerspectiveCamera, p: Vec3, scratch = new Vector3()): [number, number] | null {
  scratch.set(p[0], p[1], p[2]).applyMatrix4(camera.matrixWorldInverse);
  if (-scratch.z < CAMERA_NEAR) return null;
  scratch.set(p[0], p[1], p[2]).project(camera);
  return [((scratch.x + 1) / 2) * CANVAS_W, ((1 - scratch.y) / 2) * CANVAS_H];
}
