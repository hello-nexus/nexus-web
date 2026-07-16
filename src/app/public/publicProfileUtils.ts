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

/** Reuses the existing devices.specs.row.* i18n keys - same field labels as DevicesPage's "About this PC" panel. */
export function publicSpecRows(specs: Record<string, string>): PublicSpecRow[] {
  return SPEC_FIELD_ORDER
    .filter((key) => typeof specs[key] === 'string' && specs[key].length > 0)
    .map((key) => ({ key, labelKey: `devices.specs.row.${key}`, value: specs[key] }));
}
