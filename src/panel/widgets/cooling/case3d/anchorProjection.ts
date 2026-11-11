import { Vector3, type Camera } from 'three';

export interface CanvasPoint {
  x: number;
  y: number;
  /** False behind the camera or off the canvas. */
  visible: boolean;
}

/** Writes where a world point lands on a canvas of `w` by `h` CSS pixels into `out`. The camera's world matrix must be current, which a render of the scene guarantees. */
export function projectToCanvas(camera: Camera, at: readonly [number, number, number], w: number, h: number, scratch: Vector3, out: CanvasPoint): CanvasPoint {
  const v = scratch.set(at[0], at[1], at[2]).project(camera);
  out.x = (v.x * 0.5 + 0.5) * w;
  out.y = (-v.y * 0.5 + 0.5) * h;
  out.visible = v.z < 1 && out.x >= 0 && out.x <= w && out.y >= 0 && out.y <= h;
  return out;
}
