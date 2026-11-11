import { describe, expect, it } from 'vitest';
import { collapseMounts, parseCaseLayout } from './caseLayout';
import { FULLY_SUPPORTED_CASES, isFullySupportedCase } from './supportedCases';
import pink from './__fixtures__/hyte-x50-pink-layout.json';
import black from './__fixtures__/hyte-x50-black-layout.json';

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

describe('the airflow gate follows the case model, not the SKU', () => {
  it.each([['black', black], ['pink with paw feet', pink]])('draws the %s X50 from its saved layout', (_name, record) => {
    const parsed = parseCaseLayout(JSON.parse(JSON.stringify(record)), null);
    expect(parsed).not.toBeNull();
    expect(isFullySupportedCase(parsed?.caseModel)).toBe(true);
    expect(collapseMounts(parsed!, []).layout.fanSlots.length).toBeGreaterThan(0);
  });
});
