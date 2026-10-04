// Scene data shared by the Lighting page and the Build portal (which imports it through @app); no app imports here.

/** Millimetres. Scene space: +Y up, desk at y = 0, +Z toward the seated user. Mirrors nexus-service Lighting/Scene/SceneModels.cs. */
export type Vec3 = [number, number, number];

export interface SceneAnchor {
  id: string;
  /** fan, radiator, gpu, ram, board, pump, psu, strip, panel or surface. */
  kind: string;
  label?: string | null;
  /** Object-local centre. */
  center: Vec3;
  /** Object-local unit vector along the LED map's u. */
  right: Vec3;
  /** Object-local unit vector toward the LED map's top edge. */
  up: Vec3;
  width: number;
  height: number;
  shape: 'ring' | 'rect';
}

export interface SceneObject {
  id: string;
  kind: string;
  label?: string | null;
  source: 'user' | 'build';
  position: Vec3;
  /** Degrees, counter-clockwise seen from above. */
  yaw: number;
  size: Vec3;
  /** The scene model carries this object's shape; without one it draws as its box. */
  hasModel?: boolean;
  anchors: SceneAnchor[];
}

export interface SceneTarget {
  objectId: string;
  anchorId: string;
}

export interface SceneBinding {
  deviceId: string;
  targets: SceneTarget[];
  /** Clockwise quarter turns of the LED map on its surface, in degrees. */
  rotation: number;
  flip: boolean;
}

export interface SceneCamera {
  position: Vec3;
  target: Vec3;
  /** Vertical field of view, degrees. */
  fov: number;
}

export type DimSource = 'spec' | 'standard' | 'estimate';
export type BoxRole = 'part' | 'detail' | 'structure' | 'glass' | 'ghost' | 'limit';

export interface FanRing {
  axis: 'x' | 'y' | 'z';
  side: 'min' | 'max';
  count: number;
  diameter: number;
  // Case fans and radiators show their rings from both sides, since they face into the case.
  bothSides?: boolean;
}

// A cut along the box edge where faces a and b meet: legA runs along face a, legB along face b.
export interface Chamfer {
  a: 0 | 1 | 2;
  aMax: boolean;
  b: 0 | 1 | 2;
  bMax: boolean;
  legA: number;
  legB: number;
  // A quarter-ellipse curve between the legs instead of a flat cut.
  round?: boolean;
}

export interface OutlineRing {
  y: number;
  pts: [number, number][];
}

// Outline and cutouts as [u, v] points on the plate's other two axes, in x, y, z order.
export interface PanelPlate {
  normal: 0 | 1 | 2;
  outline: [number, number][];
  holes: [number, number][][];
  // An outer wall of the case, drawn fainter so the interior shows through it.
  wall?: boolean;
  // The outline is a shell face, whose edges the shell draws; only the cutouts draw.
  onShell?: boolean;
}

/** One drawn part of a shape, in the shape's layout space: x = depth, y = height, z = width. */
export interface ShapeBox {
  slot: string;
  role: BoxRole;
  min: Vec3;
  size: Vec3;
  source: DimSource;
  // Selection id when it differs from the slot (a fan, or an empty fan slot).
  select?: string;
  // Turn about the vertical axis through the box centre (fans on an angled corner panel).
  rotationY?: number;
  chamfers?: Chamfer[];
  // A measured shape instead of the box: its outline [x, z] at each height y, bottom to top, every ring with the
  // same vertex count; the box is their bounds.
  rings?: OutlineRing[];
  // A closed solid instead of the box: planar faces, each a polygon of [x, y, z] points.
  faces?: Vec3[][];
  // A solid read from the maker's CAD (a PSU shroud), drawn like a CAD plate.
  cadSolid?: boolean;
  // A flat plate instead of the box, lying in the box's min plane on axis `normal`.
  plate?: PanelPlate;
  fans?: FanRing;
  conflict?: boolean;
}

export interface ShapeLine {
  slot: string;
  role: 'part' | 'detail';
  points: Vec3[];
}

/** An object drawn as wireframe parts: Build's case layout, or a desk product. */
export interface LayoutShape {
  // Outer [depth, width, height]; box sizes are [x, y, z] = [depth, height, width].
  size: Vec3;
  boxes: ShapeBox[];
  lines: ShapeLine[];
  // The glass is on the right as seen from the front: the frame (window at z = 0) is then a mirror image.
  windowRight?: boolean;
  // A desktop or HTPC case, turned so the window faces +y.
  desktop?: boolean;
}

/** Every exported object's shape, by object id. */
export interface SceneModel {
  version: 1;
  shapes: Record<string, LayoutShape>;
}
