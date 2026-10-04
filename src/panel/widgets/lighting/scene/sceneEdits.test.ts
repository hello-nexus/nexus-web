import { describe, expect, it } from 'vitest';
import type { SceneObject } from '../../../../api/lightingScene';
import { flipBinding, menuDevices, mirrorGroup, moveObject, placeDevice, rotateBinding } from './sceneEdits';

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
    expect(rotateBinding(s, 'd1', -1).bindings[0].rotation).toBe(270);
    expect(flipBinding(flipBinding(s, 'd1'), 'd1').bindings[0].flip).toBe(false);
  });

  it('opens the menu on every device sharing a spot, or on the selected one among them', () => {
    const shared = placeDevice(placeDevice(placeDevice(base, 'm65', mouse.id, 'top', false), 'zone2', mouse.id, 'top', false), 'keeb', kb.id, 'top', false);
    expect(menuDevices(shared.bindings, { objectId: mouse.id, anchorId: 'top' }, null)).toEqual(['m65', 'zone2']);
    expect(menuDevices(shared.bindings, { objectId: mouse.id }, 'keeb')).toEqual(['m65', 'zone2']);
    expect(menuDevices(shared.bindings, { objectId: mouse.id, anchorId: 'top' }, 'zone2')).toEqual(['zone2']);
    expect(menuDevices(shared.bindings, { objectId: kb.id, anchorId: 'top' }, null)).toEqual(['keeb']);
    expect(menuDevices(shared.bindings, { objectId: mouse.id, anchorId: 'side' }, null)).toEqual([]);
  });

  it('mirrors a mixed group alike, then un-mirrors it', () => {
    const two = placeDevice(placeDevice(base, 'a', mouse.id, 'top', false), 'b', mouse.id, 'top', false);
    const mixed = flipBinding(two, 'a');
    const all = mirrorGroup(mixed, ['a', 'b']);
    expect(all.bindings.map(b => b.flip)).toEqual([true, true]);
    expect(mirrorGroup(all, ['a', 'b']).bindings.map(b => b.flip)).toEqual([false, false]);
    expect(mirrorGroup(two, ['a']).bindings.map(b => b.flip)).toEqual([true, false]);
  });
});
