import type { SceneCamera, SceneObject, Vec3 } from './sceneTypes';
import { CANVAS_H, CANVAS_W, sceneBounds } from './sceneMath';

export const DEFAULT_FOV = 40;

export type CameraPreset = 'front' | 'angle' | 'side' | 'top';

const round = (v: Vec3): Vec3 => [Math.round(v[0]), Math.round(v[1]), Math.round(v[2])];

/** Frames the whole scene from a named direction; distance fits the bounds' radius to the vertical fov. */
export function presetCamera(objects: SceneObject[], preset: CameraPreset, fov = DEFAULT_FOV): SceneCamera {
  const b = sceneBounds(objects) ?? { min: [-400, 0, -300] as Vec3, max: [400, 300, 300] as Vec3 };
  const center: Vec3 = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
  const radius = Math.max(150, Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) / 2);
  // The narrower of the two fovs bounds the fit; a little margin keeps edges off the frame.
  const vHalf = (fov * Math.PI) / 360;
  const hHalf = Math.atan(Math.tan(vHalf) * (CANVAS_W / CANVAS_H));
  // The bounding sphere overstates a wide, flat desk; the margin stays under it so the scene fills the frame.
  const dist = (radius * 0.92) / Math.sin(Math.min(vHalf, hHalf));
  const dir: Vec3 =
    preset === 'front' ? [0, 0.12, 1]
      : preset === 'side' ? [-1, 0.12, 0]
        : preset === 'top' ? [0, 1, 0.02]
          : [0.55, 0.45, 0.7];
  const len = Math.hypot(...dir);
  const position: Vec3 = [center[0] + (dir[0] / len) * dist, center[1] + (dir[1] / len) * dist, center[2] + (dir[2] / len) * dist];
  return { position: round(position), target: round(center), fov };
}
