import { describe, expect, it } from 'vitest';
import type { LightingDevice } from '../../api/lighting';
import { autoPlace, deviceRole } from './autoPlace';
import type { SceneAnchor, SceneObject } from './sceneTypes';

const dev = (id: string, patch: Partial<LightingDevice> = {}): LightingDevice => ({
  id, name: id, ledsOn: true, ledCount: 10, canvasX: 0, canvasY: 0, canvasW: 100, canvasH: 100, canvasRotation: 0, ...patch,
});

const spot = (id: string, kind: string): SceneAnchor => ({
  id, kind, center: [0, 0, 0], right: [1, 0, 0], up: [0, 1, 0], width: 100, height: 100, shape: 'rect',
});

const obj = (id: string, kind: string, anchors: SceneAnchor[]): SceneObject => ({
  id, kind, source: 'build', position: [0, 0, 0], yaw: 0, size: [100, 100, 100], anchors,
});

const pc = obj('case', 'case', [spot('gpu', 'gpu'), spot('ram:0', 'ram'), spot('ram:1', 'ram'), spot('fan:front:120:0', 'fan')]);
const keyboard = obj('keyboard', 'keyboard', [spot('top', 'surface')]);
const mouse = obj('mouse', 'mouse', [spot('top', 'surface')]);

describe('deviceRole', () => {
  it('reads only the type tags the hardware reports', () => {
    expect(deviceRole(dev('k', { type: 'ledstrip', iconType: 'keyboard' }))).toBe('keyboard');
    expect(deviceRole(dev('m', { type: 'mouse' }))).toBe('mouse');
    expect(deviceRole(dev('p', { type: 'mousemat' }))).toBe('mousepad');
    expect(deviceRole(dev('r', { type: 'dram' }))).toBe('ram');
    expect(deviceRole(dev('g', { type: 'gpu' }))).toBe('gpu');
  });

  it('never guesses from a name, and leaves fans and strips to the user', () => {
    expect(deviceRole(dev('a', { type: 'ledstrip', name: 'Keyboard underglow' }))).toBeNull();
    expect(deviceRole(dev('f', { iconType: 'fan', name: 'Front fan 1' }))).toBeNull();
    expect(deviceRole(dev('h', { type: 'motherboard', name: 'ARGB Header 1' }))).toBeNull();
  });
});

describe('autoPlace', () => {
  it('places a device whose spot is the only one that fits', () => {
    const r = autoPlace([pc, keyboard, mouse], [], [
      dev('kbd', { type: 'ledstrip', iconType: 'keyboard' }),
      dev('m65', { type: 'mouse' }),
      dev('5080', { type: 'gpu' }),
    ]);
    const where = (id: string) => r.bindings.find(b => b.deviceId === id)?.targets[0];
    expect(where('kbd')).toEqual({ objectId: 'keyboard', anchorId: 'top' });
    expect(where('m65')).toEqual({ objectId: 'mouse', anchorId: 'top' });
    expect(where('5080')).toEqual({ objectId: 'case', anchorId: 'gpu' });
  });

  it('adds nothing to the scene for a device with no spot', () => {
    const r = autoPlace([pc], [], [dev('kbd', { iconType: 'keyboard' })]);
    expect(r.placed).toEqual([]);
    expect(r.bindings).toEqual([]);
  });

  it('leaves ambiguous matches to the user', () => {
    // Two sticks and two RAM spots: which stick sits where is not known.
    const r = autoPlace([pc], [], [dev('a', { type: 'dram' }), dev('b', { type: 'dram' }), dev('fan', { iconType: 'fan' })]);
    expect(r.placed).toEqual([]);
  });

  it('skips placed, uncontrolled and dark devices', () => {
    const first = autoPlace([pc, keyboard], [], [dev('kbd', { iconType: 'keyboard' })]);
    const again = autoPlace([pc, keyboard], first.bindings, [
      dev('kbd', { iconType: 'keyboard' }),
      dev('gpu', { type: 'gpu', controlled: false }),
      dev('gpu2', { type: 'gpu', ledCount: 0 }),
    ]);
    expect(again.placed).toEqual([]);
  });
});
