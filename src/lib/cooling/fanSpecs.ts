import type { PcSetupItem } from '../../api/pcSetup';
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

/** The spec for a fan of `sizeMm`: the first catalog entry of that size that publishes a value, else the size default. */
export function resolveFanSpec(sizeMm: number, catalog: readonly CatalogFanSpec[]): ResolvedFanSpec {
  const fallback = defaultFanSpec(sizeMm);
  const sameSize = catalog.filter(c => c.sizeMm === sizeMm);
  const cfm = sameSize.find(c => c.cfm)?.cfm;
  const staticMmH2O = sameSize.find(c => c.staticMmH2O)?.staticMmH2O;
  return { cfm: cfm ?? fallback.cfm, staticMmH2O: staticMmH2O ?? fallback.staticMmH2O, estimated: cfm === undefined || staticMmH2O === undefined };
}
