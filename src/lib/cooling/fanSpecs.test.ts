import { describe, expect, it } from 'vitest';
import type { PcSetupItem } from '../../api/pcSetup';
import type { CaseFanSlot } from './caseLayout';
import { catalogFanSpecs, resolveFanSpec, slotModelFans } from './fanSpecs';

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

describe('slotModelFans', () => {
  const slot = (over: Partial<CaseFanSlot>): CaseFanSlot => ({ key: 'k', position: 'front', size: 120, index: 0, taken: 'fan', ...over });

  it('prefers the slot spec over a same-size catalog item and a default', () => {
    const [fan] = slotModelFans(slot({ fan: { airflowCfm: 90, staticPressureMmH2O: 2.5 } }), [{ sizeMm: 120, cfm: 70, staticMmH2O: 2.1 }]);
    expect(fan).toMatchObject({ cfm: 90, staticMmH2O: 2.5, estimated: false });
  });

  it('falls back per value and flags the estimate', () => {
    const [fan] = slotModelFans(slot({ fan: { airflowCfm: 90 } }), []);
    expect(fan).toMatchObject({ cfm: 90, staticMmH2O: 1.8, estimated: true });
  });

  it('uses defaults for an older record with no spec', () => {
    expect(slotModelFans(slot({}), [])[0]).toMatchObject({ cfm: 60, staticMmH2O: 1.8, estimated: true });
  });

  it('skips empty slots and the case slots a radiator covers', () => {
    expect(slotModelFans(slot({ taken: null }), [])).toEqual([]);
    expect(slotModelFans(slot({ taken: 'radiator', size: 360, radiator: { fanCount: 3, fanAirflowCfm: 55 } }), [])).toEqual([]);
  });

  it('takes a radiator fan slot\'s spec from the slot like any fan', () => {
    const [fan] = slotModelFans(slot({ key: 'rad:1', fan: { airflowCfm: 55, staticPressureMmH2O: 2.2 } }), []);
    expect(fan).toMatchObject({ key: 'rad:1', cfm: 55, staticMmH2O: 2.2, estimated: false });
  });
});
