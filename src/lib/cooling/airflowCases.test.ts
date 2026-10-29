import { describe, expect, it } from 'vitest';
import { AIRFLOW_CASES, supportsAirflow } from './airflowCases';

describe('supportsAirflow', () => {
  it('lists the Y70, the Y50 and the X50 by Build\'s caseModel names', () => {
    expect([...AIRFLOW_CASES]).toEqual(['HYTE Y70', 'HYTE Y50', 'HYTE X50']);
  });

  it('accepts every listed case', () => {
    for (const name of AIRFLOW_CASES) expect(supportsAirflow(name)).toBe(true);
  });

  it('rejects other cases, near matches and a missing name', () => {
    for (const name of ['HYTE Y60', 'HYTE X50 Air', 'HYTE X40', 'HYTE Y70 Touch Infinite', 'hyte y70', '', undefined, null]) expect(supportsAirflow(name)).toBe(false);
  });
});
