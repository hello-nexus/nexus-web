import { describe, expect, it } from 'vitest';
import type { SceneBinding } from '../../api/lightingScene';
import { deviceForPick } from './pickDevice';

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
