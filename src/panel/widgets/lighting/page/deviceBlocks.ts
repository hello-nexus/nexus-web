import type { LightingDevice } from '../../../../api/lighting';

// Smart-light brands, in display order, keyed by the device-id prefix the
// service routes on (e.g. "hue:<bridge>:<rid>"). Brand labels are proper nouns
// - intentionally not localized. Add a brand here when its driver ships.
const SMART_BRANDS: ReadonlyArray<readonly [prefix: string, label: string]> = [
  ['hue:', 'Philips Hue'],
  ['nanoleaf:', 'Nanoleaf'],
  ['wled:', 'WLED'],
  ['lifx:', 'LIFX'],
  ['govee:', 'Govee'],
  ['twinkly:', 'Twinkly'],
  ['wiz:', 'WiZ'],
  ['yeelight:', 'Yeelight'],
  ['elgato:', 'Elgato'],
];

function brandKeyFor(id: string): string | null {
  for (const [prefix] of SMART_BRANDS) if (id.startsWith(prefix)) return prefix;
  return null; // native PC RGB (OpenRGB / NP50 / CNVS / keeb / …)
}
function brandLabel(prefix: string): string {
  return SMART_BRANDS.find(([p]) => p === prefix)?.[1] ?? prefix;
}

export type DeviceBlock =
  | { kind: 'single'; device: LightingDevice }
  | {
      kind: 'group';
      groupKey: string;
      /** Header text: the group's custom name once renamed, else the hardware one. */
      label: string;
      /** The hardware name always, so a renamed group still strips the prefix off its children. */
      stripLabel: string;
      /** Rename target, absent on brand groups (a brand label belongs to no device). */
      parentDeviceId?: string;
      isBrand: boolean;
      isSmartHub: boolean;
      devices: LightingDevice[];
    };

/**
 * One ordered list of blocks: a single card, a motherboard group, or a
 * smart-light brand group. Each block is positioned by the first occurrence of
 * one of its members in the incoming device order, so groups and singles
 * interleave in that order and any block reorders the same way a card does.
 *
 * Shared so the device rail and the immersive Static picker group identically.
 */
export function buildDeviceBlocks(devices: LightingDevice[]): DeviceBlock[] {
  const blocks: DeviceBlock[] = [];
  const groupIndex = new Map<string, number>();
  const addToGroup = (key: string, make: () => Extract<DeviceBlock, { kind: 'group' }>, d: LightingDevice) => {
    const existing = groupIndex.get(key);
    if (existing != null) {
      const g = blocks[existing];
      if (g.kind === 'group') g.devices.push(d);
    } else {
      groupIndex.set(key, blocks.length);
      blocks.push(make());
    }
  };
  for (const d of devices) {
    const brand = brandKeyFor(d.id);
    if (brand) {
      const key = 'brand:' + brand;
      const brandName = brandLabel(brand);
      addToGroup(key, () => ({ kind: 'group', groupKey: key, label: brandName, stripLabel: brandName, isBrand: true, isSmartHub: false, devices: [d] }), d);
    } else if (d.parentDeviceId && d.zoneIndex != null) {
      const parentId = d.parentDeviceId;
      const key = 'mb:' + parentId;
      addToGroup(key, () => ({
        kind: 'group',
        groupKey: key,
        label: d.parentName ?? deriveParentName(d),
        stripLabel: deriveParentName(d),
        parentDeviceId: parentId,
        isBrand: false,
        isSmartHub: parentId.startsWith('smarthub:'),
        devices: [d],
      }), d);
    } else {
      blocks.push({ kind: 'single', device: d });
    }
  }

  // A parent-device group that collapsed to a single zone (e.g. a keeb whose
  // keys + underglow were merged into one) renders as a standalone card, not a
  // one-child category. Brand and smart-hub groups keep their header even at one
  // member: it carries the brand/firmware-control affordances a card can't.
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.kind === 'group' && !b.isBrand && !b.isSmartHub && b.devices.length === 1) {
      blocks[i] = { kind: 'single', device: b.devices[0] };
    }
  }
  return blocks;
}

// Zone names come in as "{Motherboard Name} - {Zone Name}". The parent header
// only needs the motherboard part. Fall back to the zone name if the service
// didn't use the separator convention.
// Reads the hardware name, not the shown one: a renamed zone carries a name
// the user wrote for that strip alone, and deriving the group header from it
// would relabel the whole motherboard.
function deriveParentName(zone: LightingDevice): string {
  const hardwareName = zone.originalName ?? zone.name;
  const dash = hardwareName.indexOf(' - ');
  if (dash > 0) return hardwareName.slice(0, dash);
  return hardwareName;
}

// Strip the parent name (plus a separator) off the front of a child zone's
// name so the child card shows just the zone-specific part.
export function stripParentPrefix(name: string, parentName: string): string {
  if (!parentName) return name;
  for (const sep of [' - ', ': ', ' ']) {
    const prefix = parentName + sep;
    if (name.startsWith(prefix)) {
      const rest = name.slice(prefix.length).trim();
      if (rest) return rest;
    }
  }
  return name;
}
