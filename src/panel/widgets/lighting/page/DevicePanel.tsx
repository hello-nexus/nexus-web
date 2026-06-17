import { Cpu } from 'lucide-react';
import { type LightingDevice } from '../../../../api/lighting';
import { useTranslation } from '../../../../lib/i18n';
import { usePersistentState } from '../../../../hooks/usePersistentState';
import { ZoneCard, type ZoneCardDrag } from './ZoneCard';
import { MotherboardGroup } from './MotherboardGroup';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
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

function brandKeyFor(id: string): string | null {
  for (const [prefix] of SMART_BRANDS) if (id.startsWith(prefix)) return prefix;
  return null; // native PC RGB (OpenRGB / NP50 / CNVS / keeb / …)
}
function brandLabel(prefix: string): string {
  return SMART_BRANDS.find(([p]) => p === prefix)?.[1] ?? prefix;
}

type DeviceGroup =
  | { kind: 'single'; device: LightingDevice }
  | { kind: 'motherboard'; parentId: string; parentName: string; zones: LightingDevice[] };

/**
 * Right-side sidebar listing detected RGB devices. Native PC devices render as
 * before — flat cards, with multi-header motherboards under a collapsible group.
 * Each smart-light brand (Philips Hue, …) renders as its OWN collapsible group
 * using the same component/styling as a motherboard group: a chevron, the brand
 * name, a group power switch, and its lights as indented child cards.
 */
export function DevicePanel({ devices, selectedIds, onSelectDevice, onSetSelection, onTogglePower, onSetPower, lightingOff, onOpenSettings, dragFor, communityCounts, onOpenCommunity, smartHubFirmwareControl, onSetSmartHubFirmwareControl }: {
  devices: LightingDevice[];
  /** Device ids currently selected (single-tap → 1-element set, canvas marquee → N-element set). */
  selectedIds: Set<string>;
  /** Single-replace click: clears the set and selects only this id (or null to clear). */
  onSelectDevice: (id: string | null) => void;
  /** Bulk set: shift+click on a row toggles membership without clobbering the rest. */
  onSetSelection: (ids: Set<string>, primary: string | null) => void;
  onTogglePower: (id: string) => void;
  /** Absolute set (vs. toggle). Used by group headers so a "turn all off" click
   *  can't accidentally re-enable any already-off member. */
  onSetPower: (id: string, on: boolean) => void;
  /** Whether the lighting mode is 'none' (off). Swaps the empty message. */
  lightingOff: boolean;
  onOpenSettings: (id: string) => void;
  /** Builds a per-card HTML5 drag handler. Returning null disables drag for that card. */
  dragFor?: (deviceId: string) => ZoneCardDrag | null;
  /** Device id -> available community layout count, for the card badge. */
  communityCounts?: Record<string, number>;
  /** Badge click: open the LED map editor on its Community tab. */
  onOpenCommunity?: (id: string) => void;
  /** FW Control state for the HYTE SmartHub group (default false). */
  smartHubFirmwareControl?: boolean;
  /** Toggle FW Control for the HYTE SmartHub. */
  onSetSmartHubFirmwareControl?: (enabled: boolean) => void;
}) {
  const { t } = useTranslation();

  // Persisted per-group collapse state (survives restart via localStorage).
  // Keyed by motherboard parentId or smart-brand prefix; default expanded.
  const [collapsedGroups, setCollapsedGroups] = usePersistentState<string[]>('lighting.collapsedDeviceGroups', []);
  const isCollapsed = (key: string) => collapsedGroups.includes(key);
  const toggleCollapsed = (key: string) =>
    setCollapsedGroups(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

  // Split into native devices (rendered flat / motherboard-grouped, as before)
  // and per-brand buckets (each rendered as a collapsible group). Order within
  // each is preserved; brands follow SMART_BRANDS order.
  const nativeDevices: LightingDevice[] = [];
  const brandBuckets = new Map<string, LightingDevice[]>();
  for (const d of devices) {
    const brand = brandKeyFor(d.id);
    if (brand) {
      const arr = brandBuckets.get(brand);
      if (arr) arr.push(d);
      else brandBuckets.set(brand, [d]);
    } else {
      nativeDevices.push(d);
    }
  }
  const brandOrder = SMART_BRANDS.map(([p]) => p).filter(p => brandBuckets.has(p));

  // Group native motherboard zones under a single parent header; other native
  // devices are flat top-level cards.
  const nativeGroups: DeviceGroup[] = [];
  const motherboardIndex = new Map<string, number>();
  for (const d of nativeDevices) {
    if (d.parentDeviceId && d.zoneIndex != null) {
      const existing = motherboardIndex.get(d.parentDeviceId);
      if (existing != null) {
        const g = nativeGroups[existing];
        if (g.kind === 'motherboard') g.zones.push(d);
      } else {
        motherboardIndex.set(d.parentDeviceId, nativeGroups.length);
        nativeGroups.push({ kind: 'motherboard', parentId: d.parentDeviceId, parentName: deriveParentName(d), zones: [d] });
      }
    } else {
      nativeGroups.push({ kind: 'single', device: d });
    }
  }

  // Single shift-aware click handler so cards and zones share the exact same
  // selection semantics as the canvas: plain click = single-replace, shift+click
  // = toggle this id's membership in the set.
  const handleZoneSelect = (id: string, shiftKey: boolean) => {
    if (shiftKey) {
      const next = new Set(selectedIds);
      if (next.has(id)) {
        next.delete(id);
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
    onSelectDevice(selectedIds.size === 1 && selectedIds.has(id) ? null : id);
  };

  const renderCard = (d: LightingDevice, indent: boolean, displayName?: string, fwControlled?: boolean) => (
    <ZoneCard
      key={d.id}
      device={d}
      displayName={displayName}
      selected={selectedIds.has(d.id)}
      indent={indent}
      onSelect={shiftKey => handleZoneSelect(d.id, shiftKey)}
      onTogglePower={() => onTogglePower(d.id)}
      onOpenSettings={() => onOpenSettings(d.id)}
      drag={dragFor?.(d.id) ?? undefined}
      communityCount={communityCounts?.[d.id]}
      onOpenCommunity={onOpenCommunity ? () => onOpenCommunity(d.id) : undefined}
      firmwareControlled={fwControlled}
    />
  );

  const renderNativeGroup = (g: DeviceGroup, i: number) => {
    if (g.kind === 'single') return renderCard(g.device, false);
    const groupOn = g.zones.some(z => z.ledsOn);
    const handleToggle = () => { const target = !groupOn; for (const z of g.zones) onSetPower(z.id, target); };
    const isSmartHub = g.parentId.startsWith('smarthub:');
    const fwOn = isSmartHub && !!smartHubFirmwareControl;
    const leftAction = isSmartHub && onSetSmartHubFirmwareControl ? (
      <HoverTooltip
        body={t(fwOn ? 'lighting.devices.smarthub.fwControlDisable' : 'lighting.devices.smarthub.fwControlEnable')}
        side="top"
      >
        <button
          type="button"
          role="switch"
          aria-checked={fwOn}
          aria-label={t(fwOn ? 'lighting.devices.smarthub.fwControlDisable' : 'lighting.devices.smarthub.fwControlEnable')}
          className={`${styles.deviceSettingsBtn} ${fwOn ? styles.deviceFwControlBtnOn : ''}`}
          onClick={e => { e.stopPropagation(); onSetSmartHubFirmwareControl(!fwOn); }}
        >
          <Cpu />
        </button>
      </HoverTooltip>
    ) : undefined;
    return (
      <MotherboardGroup key={g.parentId + '-' + i} parentName={g.parentName} groupOn={groupOn} onTogglePower={handleToggle}
        collapsed={isCollapsed(g.parentId)} onToggleCollapsed={() => toggleCollapsed(g.parentId)}
        leftAction={leftAction} powerDisabled={fwOn}>
        {g.zones.map(z => renderCard(z, true, stripParentPrefix(z.name, g.parentName), isSmartHub && fwOn))}
      </MotherboardGroup>
    );
  };

  return (
    <aside className={styles.devicePanel}>
      {devices.length === 0 ? (
        <p className={styles.deviceEmpty}>{t(lightingOff ? 'lighting.devices.selectModeHint' : 'lighting.devices.empty')}</p>
      ) : (
        <div className={styles.deviceList}>
          {nativeGroups.map((g, i) => renderNativeGroup(g, i))}
          {brandOrder.map(prefix => {
            const group = brandBuckets.get(prefix)!;
            const label = brandLabel(prefix);
            const groupOn = group.some(d => d.ledsOn);
            const handleToggle = () => { const target = !groupOn; for (const d of group) onSetPower(d.id, target); };
            return (
              <MotherboardGroup key={prefix} parentName={label} ariaLabel={label} groupOn={groupOn} onTogglePower={handleToggle}
                collapsed={isCollapsed(prefix)} onToggleCollapsed={() => toggleCollapsed(prefix)}>
                {group.map(d => renderCard(d, true))}
              </MotherboardGroup>
            );
          })}
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
// name so the child card shows just the zone-specific part.
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
