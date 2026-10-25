import type { PcSetupItem } from '../../api/pcSetup';
import type { CaseFanSlot } from './caseLayout';
import { scaledSpec, type SlotSpeed } from './fanSpeed';
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

/** A bound fan runs at its live share of rated speed; an unbound one keeps its rated curve. */
function applySpeed(fan: ModelFan, speed?: SlotSpeed): ModelFan {
  if (!speed) return fan;
  const scaled = scaledSpec(fan, speed.fraction);
  return { key: fan.key, cfm: scaled.cfm, staticMmH2O: scaled.staticMmH2O, estimated: fan.estimated || speed.estimated };
}

/** The fan a slot contributes: one for a taken fan slot, none otherwise (a case slot the radiator covers has no fans of its own). */
export function slotModelFans(slot: CaseFanSlot, catalog: readonly CatalogFanSpec[], speed?: SlotSpeed): ModelFan[] {
  if (slot.taken !== 'fan') return [];
  return [applySpeed({ key: slot.key, ...resolveFanSpec(slot.size, catalog, { cfm: slot.fan?.airflowCfm, staticMmH2O: slot.fan?.staticPressureMmH2O }) }, speed)];
}
