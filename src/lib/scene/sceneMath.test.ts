import { describe, expect, it } from 'vitest';
import type { LedMapEntry } from '../../api/lighting';
import type { SceneAnchor, SceneObject } from '../../api/lightingScene';
import { anchorQuad, ledWorldPositions, placements, quadAt, rotateYaw, sceneBounds } from './sceneMath';

const obj = (patch: Partial<SceneObject> = {}): SceneObject => ({
  id: 'o', kind: 'box', source: 'user', position: [0, 0, 0], yaw: 0, size: [100, 100, 100], anchors: [], ...patch,
});
const anchor = (patch: Partial<SceneAnchor> = {}): SceneAnchor => ({
  id: 'a', kind: 'surface', center: [0, 0, 0], right: [1, 0, 0], up: [0, 1, 0], width: 200, height: 100, shape: 'rect', ...patch,
});
const led = (index: number, u: number, v: number, disabled = false): LedMapEntry =>
  ({ index, u, v, disabled, name: '', zoneType: 'linear', isCustom: false });

// Mirrors nexus-service SceneMathTests so both sides lay maps out identically.
describe('sceneMath', () => {
  it('turns yaw counter-clockwise seen from above', () => {
    const v = rotateYaw([1, 0, 0], 90);
    expect(v[0]).toBeCloseTo(0, 6);
    expect(v[2]).toBeCloseTo(-1, 6);
  });

  it('puts the map top-left at the surface top-left', () => {
    const q = anchorQuad(obj({ position: [100, 0, 50] }), anchor({ center: [0, 30, 0], up: [0, 0, -1], width: 440, height: 140 }), 0, false);
    expect(quadAt(q, 0, 0)).toEqual([100 - 220, 30, 50 - 70]);
    expect(quadAt(q, 1, 1)).toEqual([100 + 220, 30, 50 + 70]);
  });

  it('swaps axes on a quarter turn so the map still fills the surface', () => {
    const q = anchorQuad(obj(), anchor(), 90, false);
    expect(q.axisU.map(v => v + 0)).toEqual([0, -100, 0]);
    expect(q.axisV.map(v => v + 0)).toEqual([-200, 0, 0]);
  });

  it('mirrors u on flip', () => {
    const q = anchorQuad(obj(), anchor(), 0, true);
    expect(q.axisU.map(v => v + 0)).toEqual([-200, 0, 0]);
  });

  it('walks a map-less device along its surface midline', () => {
    const q = anchorQuad(obj(), anchor(), 0, false);
    const pos = ledWorldPositions(3, null, [q]);
    expect(Array.from(pos)).toEqual([-100, 0, 0, 0, 0, 0, 100, 0, 0]);
  });

  it('stretches each run of a split device over its own surface and hides disabled LEDs', () => {
    const left = anchorQuad(obj(), anchor({ center: [-300, 0, 0] }), 0, false);
    const right = anchorQuad(obj(), anchor({ center: [300, 0, 0] }), 0, false);
    const leds = [led(0, 0, 0.5), led(1, 0.5, 0.5), led(2, 0.5, 0.5, true), led(3, 1, 0.5)];
    const pos = ledWorldPositions(4, leds, [left, right]);
    expect(pos[0]).toBeCloseTo(-400);
    expect(pos[3]).toBeCloseTo(-200);
    expect(Number.isNaN(pos[6])).toBe(true);
    expect(pos[9]).toBeCloseTo(400);
  });

  it('skips bindings whose targets all miss and keeps target order', () => {
    const scene = {
      objects: [obj({ id: 'case', anchors: [anchor({ id: 'f1', center: [-100, 0, 0] }), anchor({ id: 'f2', center: [100, 0, 0] })] })],
      bindings: [
        { deviceId: 'chain', targets: [{ objectId: 'case', anchorId: 'f2' }, { objectId: 'case', anchorId: 'f1' }], rotation: 0, flip: false },
        { deviceId: 'gone', targets: [{ objectId: 'case', anchorId: 'nope' }], rotation: 0, flip: false },
      ],
    };
    const p = placements(scene);
    expect(p.has('gone')).toBe(false);
    expect(p.get('chain')!.map(q => q.center[0])).toEqual([100, -100]);
  });

  it('bounds every object corner, turned objects included', () => {
    const b = sceneBounds([obj({ position: [0, 0, 0], size: [200, 50, 100], yaw: 90 })])!;
    expect(b.min[0]).toBeCloseTo(-50);
    expect(b.max[2]).toBeCloseTo(100);
    expect(b.max[1]).toBe(50);
    expect(sceneBounds([])).toBeNull();
  });
});
