import { describe, expect, it } from 'vitest';
import type { LightingDevice } from '../../api/lighting';
import { autoPlace, deviceRole } from './autoPlace';
import { genericCase } from './deskCatalog';

const dev = (id: string, patch: Partial<LightingDevice> = {}): LightingDevice => ({
  id, name: id, ledsOn: true, ledCount: 10, canvasX: 0, canvasY: 0, canvasW: 100, canvasH: 100, canvasRotation: 0, ...patch,
});

describe('autoPlace', () => {
  it('recognises devices from their type tags, then their names', () => {
    expect(deviceRole(dev('k', { iconType: 'keyboard' }))).toBe('keyboard');
    expect(deviceRole(dev('m', { type: 'mousemat' }))).toBe('mousepad');
    expect(deviceRole(dev('r', { type: 'dram' }))).toBe('ram');
    expect(deviceRole(dev('f', { name: 'SL Infinity Fan 2' }))).toBe('fan');
    expect(deviceRole(dev('h', { type: 'motherboard', name: 'ARGB Header 1' }))).toBe('strip');
    expect(deviceRole(dev('b', { type: 'motherboard', name: 'Motherboard' }))).toBe('board');
    expect(deviceRole(dev('x', { type: 'gamepad' }))).toBeNull();
  });

  it('creates desk objects for peripherals and fills case fans front first', () => {
    const pc = genericCase([]);
    const devices = [
      dev('kbd', { iconType: 'keyboard' }),
      dev('mouse', { iconType: 'mouse' }),
      dev('pad', { iconType: 'mousemat' }),
      dev('fan-a', { iconType: 'fan' }),
      dev('fan-b', { iconType: 'fan' }),
      dev('fan-c', { iconType: 'fan' }),
      dev('fan-d', { iconType: 'fan' }),
      dev('ram', { type: 'dram' }),
      dev('pad2', { type: 'gamepad' }),
    ];
    const r = autoPlace([pc], [], devices);
    expect(r.objects.map(o => o.kind).sort()).toEqual(['case', 'keyboard', 'mouse', 'mousepad']);
    const where = (id: string) => r.bindings.find(b => b.deviceId === id)!.targets[0].anchorId;
    expect(['fan-a', 'fan-b', 'fan-c'].map(where)).toEqual(['fan:front:120:0', 'fan:front:120:1', 'fan:front:120:2']);
    expect(where('fan-d')).toBe('fan:top:120:0');
    expect(where('ram')).toBe('ram:0');
    expect(r.skipped).toEqual(['pad2']);
  });

  it('leaves placed and uncontrolled devices alone and reuses free desk objects', () => {
    const pc = genericCase([]);
    const first = autoPlace([pc], [], [dev('kbd', { iconType: 'keyboard' })]);
    const again = autoPlace(first.objects, first.bindings, [
      dev('kbd', { iconType: 'keyboard' }),
      dev('off', { iconType: 'fan', controlled: false }),
    ]);
    expect(again.placed).toEqual([]);
    expect(again.objects).toHaveLength(first.objects.length);
  });

  it('skips case parts when there is no case', () => {
    const r = autoPlace([], [], [dev('fan', { iconType: 'fan' })]);
    expect(r.skipped).toEqual(['fan']);
  });
});
