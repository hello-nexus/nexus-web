import type { SceneAnchor, SceneObject, Vec3 } from '../../api/lightingScene';

/** Things a user can put on the desk in the 3D editor. Sizes are typical retail dimensions in mm. */
export type DeskKind = 'keyboard' | 'mouse' | 'mousepad' | 'deskmat' | 'headset' | 'monitor' | 'speaker' | 'strip' | 'light';

export const DESK_KINDS: DeskKind[] = ['keyboard', 'mouse', 'mousepad', 'deskmat', 'headset', 'monitor', 'speaker', 'strip', 'light'];

interface DeskSpec {
  size: Vec3;
  /** Where the first one lands on a desk whose user sits at +Z. */
  home: Vec3;
  anchor: (size: Vec3) => SceneAnchor;
}

// A surface on the object's top: map u to the right, map top toward the far edge.
const top = (size: Vec3): SceneAnchor => ({
  id: 'top', kind: 'surface', center: [0, size[1], 0], right: [1, 0, 0], up: [0, 0, -1], width: size[0], height: size[2], shape: 'rect',
});

// A surface on the face toward the user.
const front = (size: Vec3): SceneAnchor => ({
  id: 'front', kind: 'surface', center: [0, size[1] / 2, size[2] / 2], right: [1, 0, 0], up: [0, 1, 0], width: size[0], height: size[1], shape: 'rect',
});

const SPECS: Record<DeskKind, DeskSpec> = {
  keyboard: { size: [440, 32, 135], home: [-60, 0, 190], anchor: top },
  mouse: { size: [68, 40, 125], home: [300, 0, 200], anchor: top },
  mousepad: { size: [360, 4, 280], home: [300, 0, 190], anchor: top },
  deskmat: { size: [900, 3, 400], home: [80, 0, 180], anchor: top },
  headset: { size: [130, 270, 130], home: [-520, 0, -60], anchor: front },
  monitor: {
    size: [620, 380, 50],
    home: [0, 0, -220],
    // Ambient strips sit on the back; the map still reads left to right as seen from the front.
    anchor: s => ({ id: 'back', kind: 'surface', center: [0, s[1] / 2, -s[2] / 2], right: [1, 0, 0], up: [0, 1, 0], width: s[0] - 20, height: s[1] - 20, shape: 'rect' }),
  },
  speaker: { size: [100, 180, 120], home: [-420, 0, -230], anchor: front },
  strip: { size: [500, 12, 12], home: [0, 0, -330], anchor: top },
  light: { size: [150, 150, 150], home: [-650, 0, -250], anchor: front },
};

export function deskSpec(kind: DeskKind): DeskSpec {
  return SPECS[kind];
}

export function isDeskKind(kind: string): kind is DeskKind {
  return (DESK_KINDS as string[]).includes(kind);
}

/** A new desk object of a kind, next to any others of that kind, with an id unique in the scene. */
export function newDeskObject(kind: DeskKind, existing: SceneObject[], label?: string): SceneObject {
  const spec = SPECS[kind];
  const ids = new Set(existing.map(o => o.id));
  let n = 1;
  while (ids.has(`${kind}-${n}`)) n++;
  const sameKind = existing.filter(o => o.kind === kind).length;
  return {
    id: `${kind}-${n}`,
    kind,
    label: label ?? null,
    source: 'user',
    position: [spec.home[0] + sameKind * 80, spec.home[1], spec.home[2] + sameKind * 40],
    yaw: 0,
    size: [...spec.size],
    anchors: [spec.anchor(spec.size)],
  };
}

const fan = (position: string, index: number, center: Vec3, right: Vec3, up: Vec3): SceneAnchor => ({
  id: `fan:${position}:120:${index}`, kind: 'fan', center, right, up, width: 120, height: 120, shape: 'ring',
});

/**
 * A mid-tower ATX case for anyone who has not set their PC up in Build. Its
 * fan surfaces use the Build export's slot keys, so an import later takes the
 * placed devices with it. Local axes: front +Z, window side -X.
 */
export function genericCase(existing: SceneObject[]): SceneObject {
  const w = 230, h = 470, d = 450;
  const ids = new Set(existing.map(o => o.id));
  const id = ids.has('generic-case') ? `generic-case-${existing.length}` : 'generic-case';
  // Seen through the window (from -X) the viewer's right is +Z.
  const side = { right: [0, 0, 1] as Vec3, up: [0, 1, 0] as Vec3 };
  return {
    id,
    kind: 'case',
    label: null,
    source: 'user',
    position: [620, 0, -120],
    yaw: 0,
    size: [w, h, d],
    anchors: [
      fan('front', 0, [0, 370, d / 2 + 1], [1, 0, 0], [0, 1, 0]),
      fan('front', 1, [0, 240, d / 2 + 1], [1, 0, 0], [0, 1, 0]),
      fan('front', 2, [0, 110, d / 2 + 1], [1, 0, 0], [0, 1, 0]),
      fan('top', 0, [10, h + 1, 110], [1, 0, 0], [0, 0, -1]),
      fan('top', 1, [10, h + 1, -30], [1, 0, 0], [0, 0, -1]),
      fan('top', 2, [10, h + 1, -170], [1, 0, 0], [0, 0, -1]),
      fan('rear', 0, [30, 370, -d / 2 - 1], [-1, 0, 0], [0, 1, 0]),
      { id: 'gpu', kind: 'gpu', center: [-20, 200, 40], ...side, width: 300, height: 110, shape: 'rect' },
      ...[0, 1, 2, 3].map((i): SceneAnchor => ({
        id: `ram:${i}`, kind: 'ram', center: [40, 360, 60 + i * 10], right: [0, 1, 0], up: [0, 0, 1], width: 130, height: 8, shape: 'rect',
      })),
      { id: 'board', kind: 'board', center: [95, 290, 0], ...side, width: 244, height: 305, shape: 'rect' },
      { id: 'pump', kind: 'pump', center: [40, 330, -20], ...side, width: 70, height: 70, shape: 'ring' },
      { id: 'psu', kind: 'psu', center: [-110, 50, 0], ...side, width: 440, height: 90, shape: 'rect' },
      { id: 'strip:front', kind: 'strip', center: [-w / 2, h / 2, d / 2], right: [0, 1, 0], up: [0, 0, 1], width: h - 20, height: 10, shape: 'rect' },
      { id: 'strip:top', kind: 'strip', center: [-w / 2, h, 0], right: [0, 0, 1], up: [0, 1, 0], width: d - 20, height: 10, shape: 'rect' },
    ],
  };
}
