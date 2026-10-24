import type { PcSetupItem } from '../../api/pcSetup';
import type { CaseFanSlot } from './caseLayout';
import { defaultFanSpec, type FanSpec } from './pressureModel';

/** Catalog spec field names. A rename in the catalog is a change here only. */
export const CATALOG_FIELDS = {
  fan: { size: 'sizeMm', airflowCfm: 'airflowCfm', staticMmH2O: 'staticPressureMmH2O' },
  aio: { size: 'fanSizeMm', airflowCfm: 'fanAirflowCfm', staticMmH2O: 'fanStaticPressureMmH2O' },
} as const;

export interface CatalogFanSpec {
  sizeMm: number;
  cfm?: number;
  staticMmH2O?: number;
}

export interface ResolvedFanSpec extends FanSpec {
  /** True when any value came from the size-based defaults. */
  estimated: boolean;
}

const positive = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);

/** Fan specs of the owned fan and AIO catalog items in a setup; fields the maker does not publish stay undefined. */
export function catalogFanSpecs(items: readonly PcSetupItem[]): CatalogFanSpec[] {
  const out: CatalogFanSpec[] = [];
  for (const item of items) {
    const catalog = item.catalog;
    const specs = catalog?.specs;
    if (!item.owned || !specs || typeof specs !== 'object') continue;
    const fields = catalog.category === 'fan' ? CATALOG_FIELDS.fan : catalog.category === 'cooler' ? CATALOG_FIELDS.aio : null;
    if (!fields) continue;
    const s = specs as Record<string, unknown>;
    const sizeMm = positive(s[fields.size]);
    if (sizeMm) out.push({ sizeMm, cfm: positive(s[fields.airflowCfm]), staticMmH2O: positive(s[fields.staticMmH2O]) });
  }
  return out;
}

interface PartialSpec {
  cfm?: number;
  staticMmH2O?: number;
}

/** The slot's own spec first, then a catalog item of the same size, then the size default; each value falls back on its own. */
export function resolveFanSpec(sizeMm: number, catalog: readonly CatalogFanSpec[], own?: PartialSpec): ResolvedFanSpec {
  const fallback = defaultFanSpec(sizeMm);
  const sameSize = catalog.filter(c => c.sizeMm === sizeMm);
  const cfm = own?.cfm ?? sameSize.find(c => c.cfm)?.cfm;
  const staticMmH2O = own?.staticMmH2O ?? sameSize.find(c => c.staticMmH2O)?.staticMmH2O;
  return { cfm: cfm ?? fallback.cfm, staticMmH2O: staticMmH2O ?? fallback.staticMmH2O, estimated: cfm === undefined || staticMmH2O === undefined };
}

export interface ModelFan extends ResolvedFanSpec {
  key: string;
}

const RADIATOR_FAN_SIZES_MM = [120, 140];

/** Fan count and size of a radiator of `lengthMm`: the first standard fan size that divides it, else the nearest count at the first standard size. */
export function inferRadiatorFans(lengthMm: number): { count: number; sizeMm: number } {
  const size = RADIATOR_FAN_SIZES_MM.find(s => lengthMm >= s && lengthMm % s === 0);
  if (size) return { count: lengthMm / size, sizeMm: size };
  return { count: Math.max(1, Math.round(lengthMm / RADIATOR_FAN_SIZES_MM[0])), sizeMm: RADIATOR_FAN_SIZES_MM[0] };
}

/** The fans a slot contributes: one for a taken fan slot, the radiator's fans for a radiator slot (count inferred from its length when unstated, which marks them estimates). */
export function slotModelFans(slot: CaseFanSlot, catalog: readonly CatalogFanSpec[]): ModelFan[] {
  if (slot.taken === 'fan') {
    return [{ key: slot.key, ...resolveFanSpec(slot.size, catalog, { cfm: slot.fan?.airflowCfm, staticMmH2O: slot.fan?.staticPressureMmH2O }) }];
  }
  if (slot.taken !== 'radiator') return [];
  const stated = slot.radiator?.fanCount;
  const inferred = stated ? null : inferRadiatorFans(slot.size);
  const count = stated ?? inferred!.count;
  const sizeMm = inferred?.sizeMm ?? slot.size / count;
  const spec = resolveFanSpec(sizeMm, catalog, { cfm: slot.radiator?.fanAirflowCfm, staticMmH2O: slot.radiator?.fanStaticPressureMmH2O });
  const estimated = spec.estimated || inferred !== null;
  return Array.from({ length: count }, (_, i) => ({ key: i === 0 ? slot.key : `${slot.key}#${i}`, ...spec, estimated }));
}
