import { type LightingDevice } from '../../../../api/lighting';
import { useTranslation } from '../../../../lib/i18n';
import { ZoneCard, type ZoneCardDrag } from './ZoneCard';
import { MotherboardGroup } from './MotherboardGroup';
import styles from '../LightingPage.module.scss';

// Smart-light brands, in display order, keyed by the device-id prefix the
// service routes on (e.g. "hue:<bridge>:<rid>"). Brand labels are proper nouns
// — intentionally not localized. Add a brand here when its driver ships.
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
// Native PC RGB (OpenRGB / NP50 / CNVS / keeb / …) — everything that isn't a
// recognized smart-light brand prefix.
const LOCAL_CATEGORY_KEY = 'local';

function categoryKeyFor(id: string): string {
  for (const [prefix] of SMART_BRANDS) if (id.startsWith(prefix)) return prefix;
  return LOCAL_CATEGORY_KEY;
}
function categoryOrder(key: string): number {
  if (key === LOCAL_CATEGORY_KEY) return 0;
  const i = SMART_BRANDS.findIndex(([p]) => p === key);
  return i < 0 ? 99 : i + 1;
}
function categoryLabel(key: string, localLabel: string): string {
  if (key === LOCAL_CATEGORY_KEY) return localLabel;
  const b = SMART_BRANDS.find(([p]) => p === key);
  return b ? b[1] : key;
}

type DeviceGroup =
  | { kind: 'single'; device: LightingDevice }
  | { kind: 'motherboard'; parentId: string; parentName: string; zones: LightingDevice[] };

/**
 * Right-side sidebar listing detected RGB devices. Flags devices whose OpenRGB
 * detector failed (ledCount = 0) so the user can see the device is detected
 * but not drivable. Motherboards with more than one ARGB header are grouped
 * under a collapsible header; each zone renders as its own card so the user
 * can configure + control each physical strip independently.
 *
 * Devices are bucketed into provider categories — the local PC plus each
 * smart-light brand (Philips Hue, …) — with a header per category. Headers only
 * appear when more than one category is present, so a PC with no smart lights
 * looks exactly as before.
 */
export function DevicePanel({ devices, selectedIds, onSelectDevice, onSetSelection, onTogglePower, onSetPower, lightingOff, onOpenSettings, dragFor }: {
  devices: LightingDevice[];
  /** Device ids currently selected (single-tap → 1-element set, canvas marquee → N-element set). */
  selectedIds: Set<string>;
  /** Single-replace click: clears the set and selects only this id (or null to clear). */
  onSelectDevice: (id: string | null) => void;
  /** Bulk set: shift+click on a row toggles membership without clobbering the rest. */
  onSetSelection: (ids: Set<string>, primary: string | null) => void;
  onTogglePower: (id: string) => void;
  /** Absolute set (vs. toggle). Used by the motherboard group header so a
   *  "turn all off" click can't accidentally re-enable any already-off zone. */
  onSetPower: (id: string, on: boolean) => void;
  /** Whether the lighting mode is 'none' (off). Swaps the empty message. */
  lightingOff: boolean;
  onOpenSettings: (id: string) => void;
  /** Builds a per-card HTML5 drag handler. Returning null disables drag for that card. */
  dragFor?: (deviceId: string) => ZoneCardDrag | null;
}) {
  const { t } = useTranslation();

  // Group devices so motherboard zones show as children under a single parent
  // header. Non-zone devices are rendered as flat top-level cards.
  const groups: DeviceGroup[] = [];
  const motherboardIndex = new Map<string, number>();
  for (const d of devices) {
    if (d.parentDeviceId && d.zoneIndex != null) {
      const existing = motherboardIndex.get(d.parentDeviceId);
      if (existing != null) {
        const g = groups[existing];
        if (g.kind === 'motherboard') g.zones.push(d);
      } else {
        const parentName = deriveParentName(d);
        motherboardIndex.set(d.parentDeviceId, groups.length);
        groups.push({ kind: 'motherboard', parentId: d.parentDeviceId, parentName, zones: [d] });
      }
    } else {
      groups.push({ kind: 'single', device: d });
    }
  }

  // Bucket the top-level groups into provider categories, preserving each
  // category's first-seen group order and sorting categories (local first,
  // then brands in SMART_BRANDS order).
  const catMap = new Map<string, DeviceGroup[]>();
  for (const g of groups) {
    const id = g.kind === 'single' ? g.device.id : g.parentId;
    const key = categoryKeyFor(id);
    const arr = catMap.get(key);
    if (arr) arr.push(g);
    else catMap.set(key, [g]);
  }
  const categories = [...catMap.entries()]
    .map(([key, items]) => ({ key, label: categoryLabel(key, t('lighting.devices.categoryLocal')), items }))
    .sort((a, b) => categoryOrder(a.key) - categoryOrder(b.key));
  const showHeaders = categories.length > 1;

  // Single shift-aware click handler so both single cards and motherboard zones
  // share the exact same selection semantics as the canvas: plain click =
  // single-replace, shift+click = toggle this id's membership in the set.
  const handleZoneSelect = (id: string, shiftKey: boolean) => {
    if (shiftKey) {
      const next = new Set(selectedIds);
      if (next.has(id)) {
        next.delete(id);
        // Removed primary: pick the topmost remaining id (last in the
        // device list) so LED dots track to a visible frame. Same rule
        // the canvas uses on shift+click toggle.
        let nextPrimary: string | null = null;
        for (let i = devices.length - 1; i >= 0; i--) {
          if (next.has(devices[i].id)) { nextPrimary = devices[i].id; break; }
        }
        onSetSelection(next, nextPrimary);
      } else {
        next.add(id);
        onSetSelection(next, id);
      }
      return;
    }
    // Plain click: clicking the only-selected device toggles it off,
    // otherwise replaces the selection.
    onSelectDevice(selectedIds.size === 1 && selectedIds.has(id) ? null : id);
  };

  const renderGroup = (g: DeviceGroup, i: number) => {
    if (g.kind === 'single') {
      const d = g.device;
      return (
        <ZoneCard
          key={d.id}
          device={d}
          selected={selectedIds.has(d.id)}
          indent={false}
          onSelect={shiftKey => handleZoneSelect(d.id, shiftKey)}
          onTogglePower={() => onTogglePower(d.id)}
          onOpenSettings={() => onOpenSettings(d.id)}
          drag={dragFor?.(d.id) ?? undefined}
        />
      );
    }
    // Group is "on" iff any zone is on. Clicking the header switch flips every
    // zone to !groupOn — an absolute set, not a per-zone toggle (which would
    // flip already-off zones back on when the group was partially lit).
    const groupOn = g.zones.some(z => z.ledsOn);
    const handleToggleGroup = () => {
      const target = !groupOn;
      for (const z of g.zones) onSetPower(z.id, target);
    };
    return (
      <MotherboardGroup
        key={g.parentId + '-' + i}
        parentName={g.parentName}
        groupOn={groupOn}
        onTogglePower={handleToggleGroup}
      >
        {g.zones.map(z => (
          <ZoneCard
            key={z.id}
            device={z}
            displayName={stripParentPrefix(z.name, g.parentName)}
            selected={selectedIds.has(z.id)}
            indent={true}
            onSelect={shiftKey => handleZoneSelect(z.id, shiftKey)}
            onTogglePower={() => onTogglePower(z.id)}
            onOpenSettings={() => onOpenSettings(z.id)}
            drag={dragFor?.(z.id) ?? undefined}
          />
        ))}
      </MotherboardGroup>
    );
  };

  return (
    <aside className={styles.devicePanel}>
      {devices.length === 0 ? (
        <p className={styles.deviceEmpty}>{t(lightingOff ? 'lighting.devices.selectModeHint' : 'lighting.devices.empty')}</p>
      ) : (
        <div className={styles.deviceList}>
          {showHeaders
            ? categories.map(cat => (
                <section key={cat.key} className={styles.deviceCategory}>
                  <div className={styles.deviceCategoryHeader}>{cat.label}</div>
                  {cat.items.map((g, i) => renderGroup(g, i))}
                </section>
              ))
            : groups.map((g, i) => renderGroup(g, i))}
        </div>
      )}
    </aside>
  );
}

// Zone names come in as "{Motherboard Name} - {Zone Name}". The parent header
// only needs the motherboard part. Fall back to the zone name if the service
// didn't use the separator convention.
function deriveParentName(zone: LightingDevice): string {
  const dash = zone.name.indexOf(' - ');
  if (dash > 0) return zone.name.slice(0, dash);
  return zone.name;
}

// Strip the parent name (plus a separator) off the front of a child zone's
// name so the child card shows just the zone-specific part. Falls back to the
// original name if it doesn't actually start with the parent prefix.
function stripParentPrefix(name: string, parentName: string): string {
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
