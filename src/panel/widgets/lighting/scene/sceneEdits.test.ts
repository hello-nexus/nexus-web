import { describe, expect, it } from 'vitest';
import type { SceneObject } from '../../../../api/lightingScene';
import { flipBinding, moveObject, placeDevice, rotateBinding } from './sceneEdits';

const obj = (id: string): SceneObject => ({
  id, kind: id, source: 'build', position: [0, 0, 0], yaw: 0, size: [100, 10, 100],
  anchors: [{ id: 'top', kind: 'surface', center: [0, 0, 0], right: [1, 0, 0], up: [0, 1, 0], width: 100, height: 100, shape: 'rect' }],
});
const kb = obj('keyboard');
const mouse = obj('mouse');
const base = { objects: [kb, mouse], bindings: [] };

describe('scene edits', () => {
  it('places, moves a placement, and appends a second spot', () => {
    const a = placeDevice(base, 'd1', kb.id, 'top', false);
    expect(a.bindings).toEqual([{ deviceId: 'd1', targets: [{ objectId: kb.id, anchorId: 'top' }], rotation: 0, flip: false }]);
    const b = placeDevice(rotateBinding(a, 'd1'), 'd1', mouse.id, 'top', false);
    expect(b.bindings[0].targets).toEqual([{ objectId: mouse.id, anchorId: 'top' }]);
    expect(b.bindings[0].rotation).toBe(90);
    const c = placeDevice(b, 'd1', kb.id, 'top', true);
    expect(c.bindings[0].targets).toHaveLength(2);
    expect(placeDevice(c, 'd1', kb.id, 'top', true)).toBe(c);
    expect(base.bindings).toEqual([]);
  });

  it('moves and turns one object and leaves the rest', () => {
    const s = moveObject(base, mouse.id, [10, 0, 20], 45);
    expect(s.objects.find(o => o.id === mouse.id)).toMatchObject({ position: [10, 0, 20], yaw: 45 });
    expect(s.objects.find(o => o.id === kb.id)).toBe(kb);
  });

  it('rotates in quarter turns and flips from the current binding', () => {
    const s = placeDevice(base, 'd1', kb.id, 'top', false);
    const turned = rotateBinding(rotateBinding(rotateBinding(rotateBinding(s, 'd1'), 'd1'), 'd1'), 'd1');
    expect(turned.bindings[0].rotation).toBe(0);
    expect(flipBinding(flipBinding(s, 'd1'), 'd1').bindings[0].flip).toBe(false);
  });
});
