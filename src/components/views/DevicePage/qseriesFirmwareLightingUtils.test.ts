import { describe, expect, it } from 'vitest';
import type { CurvePoint } from '../../../api/cooling';
import type { QSeriesFirmwareAnimation } from '../../../api/qseries';
import {
  QSERIES_DEFAULT_ANIMATION,
  animationsEqual,
  curvesEqual,
  isAtFactoryDefaults,
  planResetWrites,
} from './qseriesFirmwareLightingUtils';

const PUMP: CurvePoint[] = [{ temp: 34, speed: 32 }, { temp: 38, speed: 37 }];
const FAN: CurvePoint[] = [{ temp: 43, speed: 29 }, { temp: 48, speed: 39 }];
const OTHER_PUMP: CurvePoint[] = [{ temp: 30, speed: 20 }, { temp: 38, speed: 37 }];

const CUSTOM_ANIMATION: QSeriesFirmwareAnimation = { animation: 2, r: 0, g: 255, b: 0, brightness: 50 };

describe('curvesEqual', () => {
  it('treats points that round to the same integers as equal', () => {
    expect(curvesEqual(PUMP, [{ temp: 34.4, speed: 31.6 }, { temp: 38, speed: 37 }])).toBe(true);
  });

  it('detects a differing point', () => {
    expect(curvesEqual(PUMP, [{ temp: 34, speed: 33 }, { temp: 38, speed: 37 }])).toBe(false);
  });

  it('detects a length mismatch', () => {
    expect(curvesEqual(PUMP, [{ temp: 34, speed: 32 }])).toBe(false);
  });
});

describe('animationsEqual', () => {
  it('matches identical fields', () => {
    expect(animationsEqual(QSERIES_DEFAULT_ANIMATION, { ...QSERIES_DEFAULT_ANIMATION })).toBe(true);
  });

  it('detects a differing field', () => {
    expect(animationsEqual(QSERIES_DEFAULT_ANIMATION, { ...QSERIES_DEFAULT_ANIMATION, brightness: 99 })).toBe(false);
  });

  it('treats null as equal only to null', () => {
    expect(animationsEqual(null, null)).toBe(true);
    expect(animationsEqual(QSERIES_DEFAULT_ANIMATION, null)).toBe(false);
  });
});

describe('isAtFactoryDefaults', () => {
  const base = {
    turboOn: false,
    curveSupported: true,
    draftPump: PUMP,
    draftFan: FAN,
    devicePump: PUMP,
    deviceFan: FAN,
    defaultPump: PUMP,
    defaultFan: FAN,
    animationSupported: true,
    draftAnimation: QSERIES_DEFAULT_ANIMATION,
    deviceAnimation: QSERIES_DEFAULT_ANIMATION,
  };

  it('is true when turbo, curve, and animation all already match factory defaults', () => {
    expect(isAtFactoryDefaults(base)).toBe(true);
  });

  it('is false when turbo is on', () => {
    expect(isAtFactoryDefaults({ ...base, turboOn: true })).toBe(false);
  });

  it('is false when only the local curve draft has drifted (device still at default)', () => {
    expect(isAtFactoryDefaults({ ...base, draftPump: OTHER_PUMP })).toBe(false);
  });

  it('is false when only the last-known device curve differs (draft reads default)', () => {
    expect(isAtFactoryDefaults({ ...base, devicePump: OTHER_PUMP })).toBe(false);
  });

  it('is false when the animation draft has drifted from default', () => {
    expect(isAtFactoryDefaults({ ...base, draftAnimation: CUSTOM_ANIMATION })).toBe(false);
  });

  it('is false when the last-known device animation differs from default', () => {
    expect(isAtFactoryDefaults({ ...base, deviceAnimation: CUSTOM_ANIMATION })).toBe(false);
  });

  it('ignores curve/animation drift entirely when that resource is unsupported', () => {
    expect(isAtFactoryDefaults({
      ...base,
      curveSupported: false,
      draftPump: OTHER_PUMP,
      devicePump: OTHER_PUMP,
      animationSupported: false,
      draftAnimation: CUSTOM_ANIMATION,
      deviceAnimation: CUSTOM_ANIMATION,
    })).toBe(true);
  });
});

describe('planResetWrites', () => {
  const base = {
    deviceTurboOn: false,
    curveSupported: true,
    devicePump: PUMP,
    deviceFan: FAN,
    defaultPump: PUMP,
    defaultFan: FAN,
    animationSupported: true,
    deviceAnimation: QSERIES_DEFAULT_ANIMATION,
  };

  it('plans no writes when the device already matches every default', () => {
    expect(planResetWrites(base)).toEqual({ writeTurboOff: false, writeCurve: false, writeAnimation: false });
  });

  it('plans a turbo-off write only when turbo is on', () => {
    expect(planResetWrites({ ...base, deviceTurboOn: true })).toEqual({
      writeTurboOff: true, writeCurve: false, writeAnimation: false,
    });
  });

  it('plans a curve write only when the device curve differs from default', () => {
    expect(planResetWrites({ ...base, devicePump: OTHER_PUMP })).toEqual({
      writeTurboOff: false, writeCurve: true, writeAnimation: false,
    });
  });

  it('plans an animation write only when the device animation differs from default', () => {
    expect(planResetWrites({ ...base, deviceAnimation: CUSTOM_ANIMATION })).toEqual({
      writeTurboOff: false, writeCurve: false, writeAnimation: true,
    });
  });

  it('skips curve/animation writes when unsupported, even if far from default', () => {
    expect(planResetWrites({
      ...base,
      curveSupported: false,
      devicePump: OTHER_PUMP,
      animationSupported: false,
      deviceAnimation: CUSTOM_ANIMATION,
    })).toEqual({ writeTurboOff: false, writeCurve: false, writeAnimation: false });
  });

  it('never writes animation when the device baseline has not loaded (null), even if supported', () => {
    // A null baseline means the read hasn't succeeded yet (initial load still
    // in flight, or a failed transient read) - writing the default here would
    // overwrite an unconfirmed device value.
    expect(planResetWrites({ ...base, deviceAnimation: null }).writeAnimation).toBe(false);
  });
});
