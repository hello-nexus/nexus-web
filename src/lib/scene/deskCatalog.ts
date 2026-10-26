import type { SceneAnchor, Vec3 } from '../../api/lightingScene';

/** Kinds of desk items Lighting names and auto-places devices on. */
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

/** The default size, first spot and surface of a kind of desk item. */
export function deskSpec(kind: DeskKind): DeskSpec {
  return SPECS[kind];
}

export function isDeskKind(kind: string): kind is DeskKind {
  return (DESK_KINDS as string[]).includes(kind);
}
