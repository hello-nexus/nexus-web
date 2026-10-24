import { describe, expect, it } from 'vitest';
import type { LightingDevice } from '../../api/lighting';
import { autoPlace, deviceRole } from './autoPlace';
import { genericCase, newDeskObject } from './deskCatalog';

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

  it('reads a renamed strip by its name before calling it a strip', () => {
    const strip = { iconType: 'strip', type: 'ledstrip' };
    expect(deviceRole(dev('a', { ...strip, name: 'Keyboard underglow' }))).toBe('keyboard');
    expect(deviceRole(dev('b', { ...strip, name: 'Mouse pad' }))).toBe('mousepad');
    expect(deviceRole(dev('c', { ...strip, name: 'Mouse' }))).toBe('mouse');
    expect(deviceRole(dev('d', { ...strip, name: 'Monitor backlight' }))).toBe('monitor');
    expect(deviceRole(dev('e', { ...strip, name: 'Light bar' }))).toBe('lightbar');
    expect(deviceRole(dev('f', { ...strip, name: 'Front fan 2' }))).toBe('fan');
    expect(deviceRole(dev('g', { ...strip, name: 'Case strip' }))).toBe('strip');
  });

  it('binds to existing objects only and fills case fans front first', () => {
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
    const desk = [newDeskObject('keyboard', []), newDeskObject('mouse', []), newDeskObject('mousepad', [])];
    const r = autoPlace([pc, ...desk], [], devices);
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

  it('creates nothing and names the devices that need an item added in Build', () => {
    const r = autoPlace([], [], [dev('fan', { iconType: 'fan' }), dev('kbd', { iconType: 'keyboard' }), dev('pad', { type: 'gamepad' })]);
    expect(r.objects).toEqual([]);
    expect(r.bindings).toEqual([]);
    expect(r.placed).toEqual([]);
    expect(r.missing.sort()).toEqual(['fan', 'kbd']);
    expect(r.skipped).toEqual(['pad']);
  });

  it('reports a second keyboard as missing once the first has taken the only spot', () => {
    const kb = newDeskObject('keyboard', []);
    const r = autoPlace([kb], [], [dev('a', { iconType: 'keyboard' }), dev('b', { iconType: 'keyboard' })]);
    expect(r.placed).toEqual(['a']);
    expect(r.missing).toEqual(['b']);
    expect(r.objects).toEqual([kb]);
  });
});
