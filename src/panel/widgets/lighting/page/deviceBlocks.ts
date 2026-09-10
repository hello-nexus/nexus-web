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

/** One rail row: a card, or one device's zones stacked under its name. */
export type ZoneBlock =
  | { kind: 'single'; device: LightingDevice }
  | {
      kind: 'split';
      /** 'mb:<deviceId>'. For a device whose zones are its whole parent run
       *  (the keeb) this is the key its group form carried, so a user group
       *  holding it keeps it. */
      groupKey: string;
      /** The device the zones name: the keeb hub, or a board port. */
      deviceId: string;
      /** Header text: the device's custom name once renamed, else its shared
       *  name prefix past the enclosing group's label. */
      label: string;
      /** The zones' shared hardware-name prefix, stripped off each zone. */
      stripLabel: string;
      devices: LightingDevice[];
    };

export type DeviceBlock =
  | ZoneBlock
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
      /** Every card, in row order. */
      devices: LightingDevice[];
      /** The group's rows: a port with one product on it is a card, a port
       *  with a chain on it is a split. */
      blocks: ZoneBlock[];
    };

/** The id a block goes by in a sortable list and in a user group's member list. */
export function blockKey(b: DeviceBlock): string {
  return b.kind === 'single' ? b.device.id : b.groupKey;
}

/**
 * One ordered list of blocks: a single card, a split card (one device's zones),
 * a parent-device group (a motherboard's ports, a hub's ports), or a
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
      addToGroup(key, () => ({ kind: 'group', groupKey: key, label: brandName, stripLabel: brandName, isBrand: true, isSmartHub: false, devices: [d], blocks: [] }), d);
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
        blocks: [],
      }), d);
    } else {
      blocks.push({ kind: 'single', device: d });
    }
  }

  // A group's rows are its devices, each a card or a split. A parent-device
  // group with a single row (a keeb: keys + underglow are one device) is that
  // row on its own, not a one-child category. Brand and smart-hub groups keep
  // their header even at one member: it carries the brand/firmware-control
  // affordances a card can't.
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.kind !== 'group') continue;
    b.blocks = zoneBlocksOf(b.devices);
    b.devices = b.blocks.flatMap(z => z.kind === 'single' ? [z.device] : z.devices);
    // A device rename lands as deviceName; a service before that field names a
    // standalone device (the keeb) through its parent rename instead.
    if (!b.isBrand && !b.isSmartHub && b.blocks.length === 1) {
      const only = b.blocks[0];
      blocks[i] = only.kind === 'split'
        ? { ...only, label: only.devices[0].deviceName ?? only.devices[0].parentName ?? only.stripLabel }
        : only;
    } else {
      for (const z of b.blocks) {
        if (z.kind === 'split') z.label = z.devices[0].deviceName ?? stripParentPrefix(z.stripLabel, b.stripLabel);
      }
    }
  }
  return blocks;
}

// Cards that name the same device (deviceId) are its zones and stack; a card
// alone on its device stays a card. That is what tells a board port with a
// fan chain on it from a port with one product: both hang off the board.
// A service that sends no deviceId gets one card per row, as before.
function zoneBlocksOf(devices: LightingDevice[]): ZoneBlock[] {
  const byDevice = new Map<string, LightingDevice[]>();
  for (const d of devices) {
    const key = d.deviceId || d.id;
    const bucket = byDevice.get(key);
    if (bucket) bucket.push(d);
    else byDevice.set(key, [d]);
  }
  return [...byDevice].map(([deviceId, members]) => {
    if (members.length === 1) return { kind: 'single', device: members[0] };
    const stripLabel = commonNamePrefix(members) || deriveParentName(members[0]);
    return { kind: 'split', groupKey: 'mb:' + deviceId, deviceId, label: stripLabel, stripLabel, devices: members };
  });
}

// The " - "-delimited prefix every zone's hardware name shares ("B850I - ARGB_V2_2"
// under "B850I - ARGB_V2_2 - QX Fan 1"), capped so each zone keeps at least its
// own last segment. Hardware names, not shown ones: a renamed zone would break
// the run.
function commonNamePrefix(zones: LightingDevice[]): string {
  const parts = zones.map(z => (z.originalName ?? z.name).split(' - '));
  const max = Math.min(...parts.map(p => p.length)) - 1;
  const shared: string[] = [];
  for (let i = 0; i < max; i++) {
    const seg = parts[0][i];
    if (!parts.every(p => p[i] === seg)) break;
    shared.push(seg);
  }
  return shared.join(' - ');
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
