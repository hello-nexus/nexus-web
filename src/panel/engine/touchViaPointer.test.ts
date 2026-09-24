import { describe, expect, it } from 'vitest';
import { readTouchViaPointerFlag, TOUCH_VIA_POINTER_PARAM } from './touchViaPointer';

describe('readTouchViaPointerFlag', () => {
  it('is off unless the macOS helper flag is exactly "1"', () => {
    expect(readTouchViaPointerFlag('')).toBe(false);
    expect(readTouchViaPointerFlag('?token=abc')).toBe(false);
    expect(readTouchViaPointerFlag(`?${TOUCH_VIA_POINTER_PARAM}=true`)).toBe(false);
    expect(readTouchViaPointerFlag(`?token=abc&${TOUCH_VIA_POINTER_PARAM}=1`)).toBe(true);
  });
});
