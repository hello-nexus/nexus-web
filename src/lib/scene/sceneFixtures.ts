import type { SceneAnchor, SceneObject, Vec3 } from '../../api/lightingScene';

const SIZES: Record<string, Vec3> = { keyboard: [440, 32, 135], mouse: [68, 40, 125], mousepad: [360, 4, 280] };

/** A desk object with one surface on its top, for tests. */
export function deskObject(kind: 'keyboard' | 'mouse' | 'mousepad', n = 1): SceneObject {
  const size = SIZES[kind];
  return {
    id: `${kind}-${n}`, kind, label: null, source: 'build', position: [0, 0, 0], yaw: 0, size: [...size],
    anchors: [{ id: 'top', kind: 'surface', center: [0, size[1], 0], right: [1, 0, 0], up: [0, 0, -1], width: size[0], height: size[2], shape: 'rect' }],
  };
}

const fan = (position: string, index: number): SceneAnchor => ({
  id: `fan:${position}:120:${index}`, kind: 'fan', center: [0, 0, 0], right: [1, 0, 0], up: [0, 1, 0], width: 120, height: 120, shape: 'ring',
});
const rect = (id: string, kind: string): SceneAnchor => ({ id, kind, center: [0, 0, 0], right: [1, 0, 0], up: [0, 1, 0], width: 100, height: 100, shape: 'rect' });

/** A case with the surfaces Build exports, for tests. */
export function caseObject(): SceneObject {
  return {
    id: 'case-1', kind: 'case', label: null, source: 'build', position: [0, 0, 0], yaw: 0, size: [230, 470, 450],
    anchors: [
      fan('front', 0), fan('front', 1), fan('front', 2), fan('top', 0), fan('top', 1), fan('top', 2), fan('rear', 0),
      rect('gpu', 'gpu'), rect('ram:0', 'ram'), rect('ram:1', 'ram'), rect('ram:2', 'ram'), rect('ram:3', 'ram'),
      rect('board', 'board'), rect('pump', 'pump'), rect('psu', 'psu'), rect('strip:front', 'strip'), rect('strip:top', 'strip'),
    ],
  };
}
