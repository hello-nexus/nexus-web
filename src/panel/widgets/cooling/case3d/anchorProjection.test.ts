import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { projectToCanvas, type CanvasPoint } from './anchorProjection';

const W = 800;
const H = 600;

/** A camera orbiting `target` at `azimuth` and `elevation` (radians), as the orbit controls leave it after a render. */
function orbit(target: Vector3, azimuth: number, elevation: number, distance = 900): PerspectiveCamera {
  const camera = new PerspectiveCamera(40, W / H, 1, 20000);
  camera.position.set(
    target.x + distance * Math.cos(elevation) * Math.sin(azimuth),
    target.y + distance * Math.sin(elevation),
    target.z + distance * Math.cos(elevation) * Math.cos(azimuth),
  );
  camera.lookAt(target);
  camera.updateMatrixWorld();
  return camera;
}

describe('projectToCanvas', () => {
  const fan = new Vector3(120, 340, 75);

  it('keeps an anchor on the point the camera orbits at every angle', () => {
    const scratch = new Vector3();
    const out: CanvasPoint = { x: 0, y: 0, visible: false };
    for (let az = 0; az < Math.PI * 2; az += 0.37) {
      for (const el of [-1.1, -0.3, 0.2, 0.9, 1.3]) {
        projectToCanvas(orbit(fan, az, el), [fan.x, fan.y, fan.z], W, H, scratch, out);
        expect(out.x).toBeCloseTo(W / 2, 3);
        expect(out.y).toBeCloseTo(H / 2, 3);
        expect(out.visible).toBe(true);
      }
    }
  });

  it('lands two world points one unit apart less than two pixels apart, so nothing displaces an anchor on screen', () => {
    const scratch = new Vector3();
    const a: CanvasPoint = { x: 0, y: 0, visible: false };
    const b: CanvasPoint = { x: 0, y: 0, visible: false };
    const near = new Vector3(fan.x + 1, fan.y, fan.z);
    const camera = orbit(fan, 0.8, 0.5);
    projectToCanvas(camera, [fan.x, fan.y, fan.z], W, H, scratch, a);
    projectToCanvas(camera, [near.x, near.y, near.z], W, H, scratch, b);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(2);
  });

  it('marks a point behind the camera hidden', () => {
    const out: CanvasPoint = { x: 0, y: 0, visible: true };
    const camera = orbit(fan, 0, 0);
    projectToCanvas(camera, [fan.x, fan.y, fan.z + 5000], W, H, new Vector3(), out);
    expect(out.visible).toBe(false);
  });
});
