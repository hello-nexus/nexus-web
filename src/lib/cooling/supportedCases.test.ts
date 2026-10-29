import { describe, expect, it } from 'vitest';
import { FULLY_SUPPORTED_CASES, isFullySupportedCase } from './supportedCases';

describe('isFullySupportedCase', () => {
  it('lists the Y70, the Y50 and the X50 by Build\'s caseModel names', () => {
    expect([...FULLY_SUPPORTED_CASES]).toEqual(['HYTE Y70', 'HYTE Y50', 'HYTE X50']);
  });

  it('accepts every listed case', () => {
    for (const name of FULLY_SUPPORTED_CASES) expect(isFullySupportedCase(name)).toBe(true);
  });

  it('rejects other cases, near matches and a missing name', () => {
    for (const name of ['HYTE Y60', 'HYTE X50 Air', 'HYTE X40', 'HYTE Y70 Touch Infinite', 'hyte y70', '', undefined, null]) expect(isFullySupportedCase(name)).toBe(false);
  });
});
