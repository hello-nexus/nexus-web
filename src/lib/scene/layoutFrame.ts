import type { LayoutShape, Vec3 } from './sceneTypes';

export interface SceneFrame {
  point: (p: Vec3) => Vec3;
  dir: (v: Vec3) => Vec3;
  /** Scene direction the glass faces. */
  window: Vec3;
}

/**
 * Layout space (x front to rear, y up, z from the window side) to scene space, origin at the footprint centre. For a
 * left-window tower this is a proper rotation putting the glass at -X. A right-window case's frame is a mirror image
 * of the real case, so the mapping mirrors x back and the glass lands at +X. A desktop's glass already faces +y.
 */
export function layoutToScene(shape: Pick<LayoutShape, 'size' | 'windowRight' | 'desktop'>): SceneFrame {
  const [D, W] = shape.size;
  const sx = shape.windowRight ? -1 : 1;
  return {
    point: (p: Vec3): Vec3 => [sx * (p[2] - W / 2), p[1], D / 2 - p[0]],
    dir: (v: Vec3): Vec3 => [sx * v[2], v[1], -v[0]],
    window: shape.desktop ? [0, 1, 0] : [-sx, 0, 0],
  };
}

/** layoutToScene's point mapping as a row-major 4x4 matrix. */
export function layoutToSceneMatrix(shape: Pick<LayoutShape, 'size' | 'windowRight'>): number[] {
  const [D, W] = shape.size;
  const sx = shape.windowRight ? -1 : 1;
  return [0, 0, sx, (-sx * W) / 2, 0, 1, 0, 0, -1, 0, 0, D / 2, 0, 0, 0, 1];
}
