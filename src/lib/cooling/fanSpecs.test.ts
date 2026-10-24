import { describe, expect, it } from 'vitest';
import type { PcSetupItem } from '../../api/pcSetup';
import { catalogFanSpecs, resolveFanSpec } from './fanSpecs';

const item = (category: string, specs: Record<string, unknown>, owned = true): PcSetupItem => ({
  id: category, kind: category, owned, catalog: { category, partId: 'p', title: 't', specs },
});

describe('catalogFanSpecs', () => {
  it('reads fan and AIO fields and skips unowned or other categories', () => {
    const specs = catalogFanSpecs([
      item('fan', { sizeMm: 120, airflowCfm: 70, staticPressureMmH2O: 2.1 }),
      item('cooler', { fanSizeMm: 140, fanAirflowCfm: 80 }),
      item('fan', { sizeMm: 120, airflowCfm: 50 }, false),
      item('gpu', { sizeMm: 120, airflowCfm: 50 }),
    ]);
    expect(specs).toEqual([
      { sizeMm: 120, cfm: 70, staticMmH2O: 2.1 },
      { sizeMm: 140, cfm: 80, staticMmH2O: undefined },
    ]);
  });
});

describe('resolveFanSpec', () => {
  it('uses catalog values and is exact only when both are present', () => {
    expect(resolveFanSpec(120, [{ sizeMm: 120, cfm: 70, staticMmH2O: 2.1 }])).toEqual({ cfm: 70, staticMmH2O: 2.1, estimated: false });
  });

  it('fills a missing value from the size default and flags it', () => {
    expect(resolveFanSpec(140, [{ sizeMm: 140, cfm: 80 }])).toEqual({ cfm: 80, staticMmH2O: 1.6, estimated: true });
  });

  it('falls back entirely with no matching size', () => {
    expect(resolveFanSpec(120, [{ sizeMm: 140, cfm: 80 }])).toEqual({ cfm: 60, staticMmH2O: 1.8, estimated: true });
  });
});
