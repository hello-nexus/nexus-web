import { describe, expect, it } from 'vitest';
import type { PcSetupItem } from '../../api/pcSetup';
import type { CaseFanSlot } from './caseLayout';
import { catalogFanSpecs, inferRadiatorFans, resolveFanSpec, slotModelFans } from './fanSpecs';

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

  it('skips empty slots and expands a radiator by its stated fan count', () => {
    expect(slotModelFans(slot({ taken: null }), [])).toEqual([]);
    const fans = slotModelFans(slot({ taken: 'radiator', size: 360, radiator: { fanCount: 3, fanAirflowCfm: 55 } }), []);
    expect(fans.map(f => f.key)).toEqual(['k', 'k#1', 'k#2']);
    expect(fans[0]).toMatchObject({ cfm: 55, staticMmH2O: 1.8, estimated: true });
  });
});

describe('radiator fan count inference', () => {
  it.each([[120, 1, 120], [240, 2, 120], [360, 3, 120], [140, 1, 140], [280, 2, 140], [420, 3, 140], [200, 2, 120]])(
    'a %i mm radiator has %i fans of %i mm', (length, count, size) => {
      expect(inferRadiatorFans(length)).toEqual({ count, sizeMm: size });
    });

  it('infers the fans of a radiator slot with no fanCount and marks them estimates', () => {
    const slot: CaseFanSlot = { key: 'top:360:0', position: 'top', size: 360, index: 0, taken: 'radiator', radiator: { fanAirflowCfm: 55, fanStaticPressureMmH2O: 2.2 } };
    const fans = slotModelFans(slot, []);
    expect(fans).toHaveLength(3);
    expect(fans.every(f => f.cfm === 55 && f.staticMmH2O === 2.2 && f.estimated)).toBe(true);
  });

  it('keeps a stated count exact when its specs are complete', () => {
    const slot: CaseFanSlot = { key: 'r', position: 'top', size: 240, index: 0, taken: 'radiator', radiator: { fanCount: 2, fanAirflowCfm: 55, fanStaticPressureMmH2O: 2.2 } };
    expect(slotModelFans(slot, []).every(f => !f.estimated)).toBe(true);
  });

  it('counts an AIO with no radiator record at all', () => {
    const slot: CaseFanSlot = { key: 'r', position: 'rear', size: 240, index: 0, taken: 'radiator' };
    expect(slotModelFans(slot, [])).toHaveLength(2);
  });
});
