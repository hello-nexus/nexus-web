import { afterEach, describe, expect, it } from 'vitest';
import { liveContactButtons, primaryReleasedDuringMove, resetPointerButtonsReportedCache, readPointerButtonsReported, readTouchViaPointerFlag, TOUCH_VIA_POINTER_INJECTED, TOUCH_VIA_POINTER_PARAM } from './touchViaPointer';

describe('readTouchViaPointerFlag', () => {
  it('is on only for the macOS helper flags', () => {
    expect(readTouchViaPointerFlag('')).toBe(false);
    expect(readTouchViaPointerFlag('?token=abc')).toBe(false);
    expect(readTouchViaPointerFlag(`?${TOUCH_VIA_POINTER_PARAM}=true`)).toBe(false);
    expect(readTouchViaPointerFlag(`?token=abc&${TOUCH_VIA_POINTER_PARAM}=1`)).toBe(true);
    expect(readTouchViaPointerFlag(`?${TOUCH_VIA_POINTER_PARAM}=${TOUCH_VIA_POINTER_INJECTED}`)).toBe(true);
  });
});

describe('readPointerButtonsReported', () => {
  it('trusts the button state except under the injected flag', () => {
    expect(readPointerButtonsReported('')).toBe(true);
    expect(readPointerButtonsReported(`?${TOUCH_VIA_POINTER_PARAM}=1`)).toBe(true);
    expect(readPointerButtonsReported(`?token=abc&${TOUCH_VIA_POINTER_PARAM}=${TOUCH_VIA_POINTER_INJECTED}`)).toBe(false);
  });
});

describe('button state under the injected flag', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
    resetPointerButtonsReportedCache();
  });
  const move = (buttons: number) => ({ buttons });

  it('reads a move with no button as a release when buttons are reported', () => {
    resetPointerButtonsReportedCache();
    expect(primaryReleasedDuringMove(move(0))).toBe(true);
    expect(liveContactButtons(move(0), true)).toBe(0);
  });

  it('reports the primary button held for a live contact and never a release', () => {
    window.history.replaceState(null, '', `/?${TOUCH_VIA_POINTER_PARAM}=${TOUCH_VIA_POINTER_INJECTED}`);
    resetPointerButtonsReportedCache();
    expect(primaryReleasedDuringMove(move(0))).toBe(false);
    expect(liveContactButtons(move(0), true)).toBe(1);
    expect(liveContactButtons(move(0), false)).toBe(0);
  });
});
