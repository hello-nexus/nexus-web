import { describe, expect, it } from 'vitest';
import type { CurveHazard, GuardResponse } from '../../../../api/cooling';
import { latestError, newGuardError, guardBannerKey, guardBannerText, hazardSignature, hazardText, healLines, lintLines } from './guardUtils';

// Echoes the key and its variables so the assertions can see both.
const t = (key: string, vars?: Record<string, string | number>) =>
  vars ? `${key}|${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(',')}` : key;

const guard = (over: Partial<GuardResponse>): GuardResponse => ({
  state: 'normal', guardTempC: 70.4, limitC: 95, limitSource: 'spec', sinceUtcMs: null, lastTrip: null,
  heal: { undoAvailable: false, healedAtUtcMs: null, channels: [] },
  ...over,
});

describe('guardBannerKey', () => {
  it('shows nothing for normal, off and inactive', () => {
    expect(guardBannerKey(guard({ state: 'normal' }))).toBeNull();
    expect(guardBannerKey(guard({ state: 'off' }))).toBeNull();
    expect(guardBannerKey(guard({ state: 'inactive' }))).toBeNull();
    expect(guardBannerKey(null)).toBeNull();
  });

  it('names the floor, trip causes and escalation', () => {
    expect(guardBannerKey(guard({ state: 'floor' }))).toBe('cooling.guard.banner.floor');
    expect(guardBannerKey(guard({ state: 'escalated' }))).toBe('cooling.guard.banner.escalated');
    const trip = (reason: 'limit' | 'cooling-loss') =>
      guard({ state: 'tripped', lastTrip: { atUtcMs: 1, peakC: 90, reason, escalated: false } });
    expect(guardBannerKey(trip('limit'))).toBe('cooling.guard.banner.tripLimit');
    expect(guardBannerKey(trip('cooling-loss'))).toBe('cooling.guard.banner.tripLoss');
  });

  it('rounds the temperature and limit into the text', () => {
    expect(guardBannerText(guard({ state: 'floor' }), t)).toBe('cooling.guard.banner.floor|temp=70,limit=95');
  });
});

describe('hazard text', () => {
  const h: CurveHazard = { channelId: 'a', channelName: 'Fan #1', kind: 'follows-stoppable-source', rootId: 'g', rootName: 'GPU Fan 1' };

  it('maps each kind and falls back for an unknown one', () => {
    expect(hazardText('Fan #1', 'follows-stoppable-source', 'GPU Fan 1', t)).toContain('hazard.followsSource|channel=Fan #1,source=GPU Fan 1');
    expect(hazardText('F', 'non-cpu-sensor', null, t)).toContain('hazard.nonCpuSensor');
    expect(hazardText('F', 'low-ceiling', null, t)).toContain('hazard.lowCeiling');
    expect(hazardText('F', 'manual-low', null, t)).toContain('hazard.manualLow');
    expect(hazardText('F', 'something-new', null, t)).toContain('hazard.generic');
  });

  it('names a generic source when the root is unknown', () => {
    expect(hazardText('F', 'follows-stoppable-source', null, t)).toContain('source=cooling.guard.hazard.unknownSource');
  });

  it('builds a line per hazard and per healed channel', () => {
    expect(lintLines([h], t)).toHaveLength(1);
    expect(healLines([{ id: 'a', name: 'Fan #1', hazard: 'manual-low' }], t)[0]).toContain('hazard.manualLow');
  });

  it('signs a hazard set independent of order', () => {
    const b: CurveHazard = { ...h, channelId: 'b' };
    expect(hazardSignature([h, b])).toBe(hazardSignature([b, h]));
    expect(hazardSignature([])).toBe('');
  });
});

describe('latestError', () => {
  it('returns the newest error, whichever source made it', () => {
    const older = newGuardError('older');
    const newer = newGuardError('newer');
    expect(latestError(older, newer)).toBe('newer');
    expect(latestError(newer, older)).toBe('newer');
    expect(latestError(null, older)).toBe('older');
    expect(latestError(null, null)).toBeNull();
  });
});
