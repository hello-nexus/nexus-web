import { describe, expect, it } from 'vitest';
import { deskObject } from '../../../../lib/scene/sceneFixtures';
import { editBinding, flipBinding, moveObject, placeDevice, rotateBinding, turnObject, unplaceDevice } from './sceneEdits';

const kb = deskObject('keyboard');
const mouse = deskObject('mouse');
const base = { objects: [kb, mouse], bindings: [] };

describe('scene edits', () => {
  it('places, moves a placement, and appends a second surface', () => {
    const a = placeDevice(base, 'd1', kb.id, 'top', false);
    expect(a.bindings).toEqual([{ deviceId: 'd1', targets: [{ objectId: kb.id, anchorId: 'top' }], rotation: 0, flip: false }]);
    const b = placeDevice(editBinding(a, 'd1', { rotation: 90 }), 'd1', mouse.id, 'top', false);
    expect(b.bindings[0].targets).toEqual([{ objectId: mouse.id, anchorId: 'top' }]);
    expect(b.bindings[0].rotation).toBe(90);
    const c = placeDevice(b, 'd1', kb.id, 'top', true);
    expect(c.bindings[0].targets).toHaveLength(2);
    expect(placeDevice(c, 'd1', kb.id, 'top', true)).toBe(c);
    expect(base.bindings).toEqual([]);
  });

  it('unplaces a device', () => {
    const s = placeDevice(placeDevice(base, 'd1', kb.id, 'top', false), 'd2', mouse.id, 'top', false);
    expect(unplaceDevice(s, 'd1').bindings.map(b => b.deviceId)).toEqual(['d2']);
  });

  it('rotates in quarter turns and flips from the current binding', () => {
    const s = placeDevice(base, 'd1', kb.id, 'top', false);
    const turned = rotateBinding(rotateBinding(rotateBinding(rotateBinding(s, 'd1'), 'd1'), 'd1'), 'd1');
    expect(turned.bindings[0].rotation).toBe(0);
    expect(rotateBinding(s, 'd1').bindings[0].rotation).toBe(90);
    expect(flipBinding(flipBinding(s, 'd1'), 'd1').bindings[0].flip).toBe(false);
  });

  it('moves and turns objects, wrapping yaw', () => {
    const m = moveObject(base, kb.id, [10, 0, 20]);
    expect(m.objects[0].position).toEqual([10, 0, 20]);
    expect(turnObject(base, kb.id, -15).objects[0].yaw).toBe(345);
  });

});
