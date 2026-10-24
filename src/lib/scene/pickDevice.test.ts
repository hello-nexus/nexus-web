import { describe, expect, it } from 'vitest';
import type { SceneBinding } from '../../api/lightingScene';
import type { SceneObject } from '../../api/lightingScene';
import { deviceForPick, deviceForStack, healBindings } from './pickDevice';

const bind = (deviceId: string, ...targets: [string, string][]): SceneBinding => ({
  deviceId, targets: targets.map(([objectId, anchorId]) => ({ objectId, anchorId })), rotation: 0, flip: false,
});
const bindings = [
  bind('fan-a', ['case', 'fan:front:120:0']),
  bind('fan-b', ['case', 'fan:front:120:1']),
  bind('kbd', ['kb-1', 'top']),
  bind('chain', ['case', 'fan:top:120:0'], ['kb-1', 'top']),
];

describe('deviceForPick', () => {
  it('names the device bound on the spot that was hit', () => {
    expect(deviceForPick(bindings, { kind: 'anchor', objectId: 'case', anchorId: 'fan:front:120:1' })).toBe('fan-b');
    expect(deviceForPick(bindings, { kind: 'anchor', objectId: 'case', anchorId: 'fan:top:120:0' })).toBe('chain');
  });

  it('takes the first bound device when several share the spot', () => {
    expect(deviceForPick(bindings, { kind: 'anchor', objectId: 'kb-1', anchorId: 'top' })).toBe('kbd');
  });

  it('names the first device bound on an object whose body was hit', () => {
    expect(deviceForPick(bindings, { kind: 'object', objectId: 'case' })).toBe('fan-a');
    expect(deviceForPick(bindings, { kind: 'object', objectId: 'kb-1' })).toBe('kbd');
  });

  it('is null for a free spot, an unbound object and an empty click', () => {
    expect(deviceForPick(bindings, { kind: 'anchor', objectId: 'case', anchorId: 'ram:0' })).toBeNull();
    expect(deviceForPick(bindings, { kind: 'object', objectId: 'mouse-1' })).toBeNull();
    expect(deviceForPick(bindings, null)).toBeNull();
  });
});

describe('deviceForStack', () => {
  const picks = [
    { kind: 'anchor', objectId: 'monitor', anchorId: 'back' },
    { kind: 'object', objectId: 'monitor' },
    { kind: 'anchor', objectId: 'case', anchorId: 'fan:front:120:1' },
    { kind: 'object', objectId: 'case' },
  ] as const;

  it('looks past a free surface in front to the bound one behind it', () => {
    expect(deviceForStack(bindings, [...picks])).toBe('fan-b');
  });

  it('prefers a bound surface over an object body in front of it', () => {
    expect(deviceForStack(bindings, [{ kind: 'object', objectId: 'kb-1' }, { kind: 'anchor', objectId: 'case', anchorId: 'fan:front:120:0' }])).toBe('fan-a');
  });

  it('falls back to an object body when no surface names a device, and is null for an empty stack', () => {
    expect(deviceForStack(bindings, [{ kind: 'anchor', objectId: 'monitor', anchorId: 'back' }, { kind: 'object', objectId: 'case' }])).toBe('fan-a');
    expect(deviceForStack(bindings, [{ kind: 'anchor', objectId: 'monitor', anchorId: 'back' }])).toBeNull();
    expect(deviceForStack(bindings, [])).toBeNull();
  });
});

describe('healBindings', () => {
  const obj = (id: string, kind: string): SceneObject => ({
    id, kind, label: null, source: 'build', position: [0, 0, 0], yaw: 0, size: [1, 1, 1],
    anchors: [{ id: 'top', kind: 'surface', center: [0, 0, 0], right: [1, 0, 0], up: [0, 1, 0], width: 1, height: 1, shape: 'rect' }],
  });

  it('leaves a binding whose object exists untouched', () => {
    const objects = [obj('case', 'case'), obj('p-mouse-1', 'mouse')];
    const fine = [bind('a', ['case', 'top']), bind('b', ['p-mouse-1', 'top'])];
    expect(healBindings(objects, fine)).toBe(fine);
  });

  it('retargets a binding that names a gone desk item to the only object of that kind', () => {
    const objects = [obj('case', 'case'), obj('p-mouse-8445a2d5-0', 'mouse'), obj('p-keyboard-fcf22239-0', 'keyboard')];
    const healed = healBindings(objects, [bind('m65', ['mouse-1', 'top']), bind('kbd', ['keyboard-1', 'top']), bind('fan-a', ['case', 'fan:front:120:0'])]);
    expect(healed.map(b => b.targets[0].objectId)).toEqual(['p-mouse-8445a2d5-0', 'p-keyboard-fcf22239-0', 'case']);
  });

  it('leaves a binding alone when the heir is taken, has no such surface, or no single object of the kind exists', () => {
    const objects = [obj('p-mouse-1', 'mouse')];
    const taken = [bind('a', ['p-mouse-1', 'top']), bind('b', ['mouse-1', 'top'])];
    expect(healBindings(objects, taken)).toBe(taken);
    const noSurface = [bind('c', ['mouse-1', 'bottom'])];
    expect(healBindings(objects, noSurface)).toBe(noSurface);
    const none = [bind('d', ['headset-1', 'top'])];
    expect(healBindings(objects, none)).toBe(none);
    const two = [obj('p-kb-a', 'keyboard'), obj('p-kb-b', 'keyboard')];
    const kbd = [bind('k', ['keyboard-1', 'top'])];
    expect(healBindings(two, kbd)).toBe(kbd);
  });
});
