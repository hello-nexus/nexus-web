import { beforeEach, describe, expect, it } from 'vitest';
import { loadCoolingCache } from './coolingCache';

// A cache written by an older build holds curves with no object for a mode
// that did not exist yet. The editor reads curve.<mode>.<field> directly, so
// that is a crash on open, which is exactly what shipping the trigger / sync /
// auto modes did to anyone who had visited the cooling page before.

const KEY = 'nexus_cooling_cache_v3';

beforeEach(() => localStorage.clear());

describe('cooling cache curve shape', () => {
  it('fills in modes a cached curve predates', () => {
    localStorage.setItem(KEY, JSON.stringify({
      curves: [{
        id: 'old', name: 'Old', type: 'multipoint', sourceId: 'cpu',
        flat: { speed: 50 },
        linear: { responseTime: 1.5, minTemp: 35, maxTemp: 75, minSpeed: 30, maxSpeed: 90 },
        multipoint: { responseTime: 1.5, points: [{ temp: 30, speed: 25 }] },
        mix: { responseTime: 1.5, curveIds: [], fn: 'max' },
      }],
    }));

    const curve = loadCoolingCache().curves[0];
    expect(curve.trigger.idleTemp).toBeTypeOf('number');
    expect(curve.sync.sourceChannelId).toBeTypeOf('string');
    expect(curve.auto.step).toBeTypeOf('number');
  });

  it('keeps what the cached curve did carry', () => {
    localStorage.setItem(KEY, JSON.stringify({
      curves: [{ id: 'old', name: 'Old', type: 'flat', sourceId: 'cpu', flat: { speed: 42 } }],
    }));

    const curve = loadCoolingCache().curves[0];
    expect(curve.name).toBe('Old');
    expect(curve.flat.speed).toBe(42);
    expect(curve.type).toBe('flat');
  });

  it('reads an empty cache as no curves', () => {
    expect(loadCoolingCache().curves).toEqual([]);
  });
});
