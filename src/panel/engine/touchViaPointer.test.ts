import { describe, expect, it } from 'vitest';
import { readPointerButtonsReported, readTouchViaPointerFlag, TOUCH_VIA_POINTER_INJECTED, TOUCH_VIA_POINTER_PARAM } from './touchViaPointer';

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
