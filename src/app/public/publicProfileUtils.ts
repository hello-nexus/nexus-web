import type { SystemSpecs } from '../../hooks/useSystemSpecs';

// Identity -> OS -> core silicon -> memory -> storage -> display -> audio ->
// network. Mirrors DevicesPage's specRows order for the same
// SystemSpecsResponse shape; the public account API returns any subset of
// these fields. Exported so the account devices editor (ManualDeviceModal)
// can build the same labeled fields for a manual entry's form.
export const SPEC_FIELD_ORDER: (keyof SystemSpecs)[] = [
  'pcName', 'osBuild', 'processor', 'motherboard', 'memory',
  'storage', 'graphicsCard', 'monitor', 'soundCard', 'networkCard',
];

export interface PublicSpecRow {
  key: keyof SystemSpecs;
  labelKey: string;
  value: string;
}

/** SystemSpecsCollector.cs joins every adapter, iGPU included, with this. */
const GPU_JOINER = ' + ';

/** Integrated adapter names. A copy of nexus-api's hardware-normalizer INTEGRATED_GPU; edit both together. */
const INTEGRATED_GPU =
  /\bRadeon(?:\(TM\))?\s+(?:Graphics\b|Vega\s+\d{1,2}\b|RX\s+Vega\s+\d{1,2}\s+Graphics\b|\d{3,4}[MS]\b)|\bIntel(?:\(R\))?\s+(?:UHD|HD|Iris)\b|\bArc(?:\(TM\))?\s+Graphics\b/i;

/** Drops integrated adapters from a " + "-joined graphicsCard; an iGPU-only machine keeps its list. */
export function withoutIntegratedGpus(graphicsCard: string): string {
  const adapters = graphicsCard.split(GPU_JOINER).map((s) => s.trim()).filter(Boolean);
  const discrete = adapters.filter((name) => !INTEGRATED_GPU.test(name));
  return discrete.length > 0 ? discrete.join(GPU_JOINER) : graphicsCard;
}

/** Reuses the existing devices.specs.row.* i18n keys - same field labels as DevicesPage's "About this PC" panel. */
export function publicSpecRows(specs: Record<string, string>): PublicSpecRow[] {
  return SPEC_FIELD_ORDER
    .filter((key) => typeof specs[key] === 'string' && specs[key].length > 0)
    .map((key) => ({
      key,
      labelKey: `devices.specs.row.${key}`,
      value: key === 'graphicsCard' ? withoutIntegratedGpus(specs[key]) : specs[key],
    }));
}
