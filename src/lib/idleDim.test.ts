import { describe, expect, it } from 'vitest';
import type { IdleDimState } from '../api/lighting';
import { effectiveIdleTimeout, normalizeIdleDim, snapIdleTimeout } from './idleDim';

const base: IdleDimState = {
  enabled: true, timeoutSeconds: 0, level: 10, supported: true, screenOffSupported: true, osScreenOffSeconds: null,
};

describe('effectiveIdleTimeout', () => {
  it('keeps the display-off timeout where it is available', () => {
    expect(effectiveIdleTimeout(0, true)).toBe(0);
  });

  it('maps the display-off timeout to ten minutes where it is not', () => {
    expect(effectiveIdleTimeout(0, false)).toBe(600);
  });

  it('leaves fixed timeouts alone', () => {
    expect(effectiveIdleTimeout(1800, false)).toBe(1800);
  });
});

describe('normalizeIdleDim', () => {
  it('maps a stored 0 to 600 when the display-off event is unsupported', () => {
    expect(normalizeIdleDim({ ...base, screenOffSupported: false }).timeoutSeconds).toBe(600);
  });

  it('keeps an off-list stored timeout', () => {
    expect(normalizeIdleDim({ ...base, timeoutSeconds: 240 }).timeoutSeconds).toBe(240);
  });

  it('treats a missing screenOffSupported as supported', () => {
    const legacy: Partial<IdleDimState> = { ...base };
    delete legacy.screenOffSupported;
    expect(normalizeIdleDim(legacy as IdleDimState)).toMatchObject({ screenOffSupported: true, timeoutSeconds: 0 });
  });
});

describe('snapIdleTimeout', () => {
  it('snaps an off-list timeout to the nearest offered one', () => {
    expect(snapIdleTimeout(240)).toBe(180);
    expect(snapIdleTimeout(86400)).toBe(18000);
  });
});
