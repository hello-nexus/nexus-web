import { Cpu, Plus } from 'lucide-react';
import { type LightingDevice } from '../../../../api/lighting';
import { useTranslation } from '../../../../lib/i18n';
import { usePersistentState } from '../../../../hooks/usePersistentState';
import { ZoneCard, type ZoneCardDrag } from './ZoneCard';
import { MotherboardGroup } from './MotherboardGroup';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import type { CollapsibleSectionDrag } from '../../../../components/common/CollapsibleSection/CollapsibleSection';
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

type DeviceBlock =
  | { kind: 'single'; device: LightingDevice }
  | { kind: 'group'; groupKey: string; label: string; isBrand: boolean; isSmartHub: boolean; devices: LightingDevice[] };

/**
 * Right-side sidebar listing detected RGB devices. Native PC devices render as
 * before — flat cards, with multi-header motherboards under a collapsible group.
 * Each smart-light brand (Philips Hue, …) renders as its OWN collapsible group
 * using the same component/styling as a motherboard group: a chevron, the brand
 * name, a group power switch, and its lights as indented child cards.
 */
export function DevicePanel({ devices, selectedIds, onSelectDevice, onSetSelection, onTogglePower, onSetPower, lightingOff, onOpenSettings, dragFor, dragForGroup, communityCounts, onOpenCommunity, smartHubFirmwareControl, onSetSmartHubFirmwareControl, onOpenSmartLights }: {
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
  /** Builds reorder-drag wiring for a whole device group (motherboard / brand),
   *  given its key and the ids of its member devices. */
  dragForGroup?: (groupKey: string, memberIds: string[]) => CollapsibleSectionDrag | null;
  /** Device id -> available community layout count, for the card badge. */
  communityCounts?: Record<string, number>;
  /** Badge click: open the LED map editor on its Community tab. */
  onOpenCommunity?: (id: string) => void;
  /** FW Control state for the HYTE SmartHub group (default false). */
  smartHubFirmwareControl?: boolean;
  /** Toggle FW Control for the HYTE SmartHub. */
  onSetSmartHubFirmwareControl?: (enabled: boolean) => void;
  /** Renders a dashed "add smart lights" entry at the bottom of the list. */
  onOpenSmartLights?: () => void;
}) {
  const { t } = useTranslation();

  // Persisted per-group collapse state (survives restart via localStorage).
  // Keyed by the block key ('mb:<parentId>' / 'brand:<prefix>'); default expanded.
  const [collapsedGroups, setCollapsedGroups] = usePersistentState<string[]>('lighting.collapsedDeviceGroups', []);
  const isCollapsed = (key: string) => collapsedGroups.includes(key);
  const toggleCollapsed = (key: string) =>
    setCollapsedGroups(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

  // One ordered list of blocks: a single card, a motherboard group, or a
  // smart-light brand group. Each block is positioned by the first occurrence
  // of one of its members in the incoming device order, so groups and singles
  // interleave in that order and any block reorders the same way a card does.
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
      addToGroup(key, () => ({ kind: 'group', groupKey: key, label: brandLabel(brand), isBrand: true, isSmartHub: false, devices: [d] }), d);
    } else if (d.parentDeviceId && d.zoneIndex != null) {
      const parentId = d.parentDeviceId;
      const key = 'mb:' + parentId;
      addToGroup(key, () => ({ kind: 'group', groupKey: key, label: deriveParentName(d), isBrand: false, isSmartHub: parentId.startsWith('smarthub:'), devices: [d] }), d);
    } else {
      blocks.push({ kind: 'single', device: d });
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

  const renderBlock = (block: DeviceBlock) => {
    if (block.kind === 'single') return renderCard(block.device, false);
    const { groupKey, label, isBrand, isSmartHub, devices: members } = block;
    const groupOn = members.some(z => z.ledsOn);
    const handleToggle = () => { const target = !groupOn; for (const z of members) onSetPower(z.id, target); };
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
      <MotherboardGroup key={groupKey} parentName={label} ariaLabel={isBrand ? label : undefined}
        groupOn={groupOn} onTogglePower={handleToggle}
        collapsed={isCollapsed(groupKey)} onToggleCollapsed={() => toggleCollapsed(groupKey)}
        leftAction={leftAction} powerDisabled={fwOn}
        drag={dragForGroup?.(groupKey, members.map(d => d.id)) ?? undefined}>
        {members.map(z => isBrand
          ? renderCard(z, true)
          : renderCard(z, true, stripParentPrefix(z.name, label), isSmartHub && fwOn))}
      </MotherboardGroup>
    );
  };

  return (
    <aside className={styles.devicePanel}>
      <div className={styles.deviceList}>
        {devices.length === 0 && (
          <p className={styles.deviceEmpty}>{t(lightingOff ? 'lighting.devices.selectModeHint' : 'lighting.devices.empty')}</p>
        )}
        {blocks.map(renderBlock)}
        {onOpenSmartLights && (
          <button type="button" className={styles.addSmartLights} onClick={onOpenSmartLights}>
            <Plus size={22} aria-hidden />
            <span>{t('smartLights.title')}</span>
          </button>
        )}
      </div>
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
