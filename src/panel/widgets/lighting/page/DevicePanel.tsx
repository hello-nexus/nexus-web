import { type ReactNode } from 'react';
import { Cpu, Plus } from 'lucide-react';
import { type LightingDevice, type LayoutPreset } from '../../../../api/lighting';
import { useTranslation } from '../../../../lib/i18n';
import { PresetToolbar } from '../../../../components/common/PresetToolbar/PresetToolbar';
import { usePersistentState } from '../../../../hooks/usePersistentState';
import { ZoneCard } from './ZoneCard';
import { MotherboardGroup } from './MotherboardGroup';
import { lightingDeviceNoticeKey } from './lightingDeviceNotices';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import { SortableList, type SortableRowArgs } from '../../../../components/common/SortableList/SortableList';
import styles from '../LightingPage.module.scss';

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

type DeviceBlock =
  | { kind: 'single'; device: LightingDevice }
  | { kind: 'group'; groupKey: string; label: string; isBrand: boolean; isSmartHub: boolean; devices: LightingDevice[] };

/**
 * Right-side sidebar listing detected RGB devices. Native PC devices render as
 * before - flat cards, with multi-header motherboards under a collapsible group.
 * Each smart-light brand (Philips Hue, …) renders as its OWN collapsible group
 * using the same component/styling as a motherboard group: a chevron, the brand
 * name, a group power switch, and its lights as indented child cards.
 */
export function DevicePanel({ devices, header, selectedIds, onSelectDevice, onSetSelection, onTogglePower, onSetPower, onToggleControlled, onSetControlled, lightingOff, onOpenSettings, onDeviceReorder, communityCounts, onOpenCommunity, smartHubFirmwareControl, onSetSmartHubFirmwareControl, lianLiFirmwareActive, onOpenSmartLights, presets, layoutActiveId, presetCount, canUndo, canRedo, onPresetLoad, onPresetCreate, onPresetRename, onPresetDelete, onLayoutReset, onLayoutUndo, onLayoutRedo }: {
  devices: LightingDevice[];
  /** Optional control rendered at the top of the scrolling list (master brightness). */
  header?: ReactNode;
  /** Device ids currently selected (single-tap → 1-element set, canvas marquee → N-element set). */
  selectedIds: Set<string>;
  /** Single-replace click: clears the set and selects only this id (or null to clear). */
  onSelectDevice: (id: string | null) => void;
  /** Bulk set: Cmd/Ctrl+click on a row toggles membership without clobbering the rest. */
  onSetSelection: (ids: Set<string>, primary: string | null) => void;
  onTogglePower: (id: string) => void;
  /** Absolute set (vs. toggle). Used by group headers so a "turn all off" click
   *  can't accidentally re-enable any already-off member. */
  onSetPower: (id: string, on: boolean) => void;
  /** Per-zone toggle for whether Nexus pushes frames to the device at all. */
  onToggleControlled: (id: string) => void;
  /** Absolute set, mirroring onSetPower, used by group headers. */
  onSetControlled: (id: string, controlled: boolean) => void;
  /** Whether the lighting mode is 'none' (off). Swaps the empty message. */
  lightingOff: boolean;
  onOpenSettings: (id: string) => void;
  /** Called after a drag reorder with the new flat device-id ordering. */
  onDeviceReorder?: (newDeviceOrder: string[]) => void;
  /** Device id -> available community layout count, for the card badge. */
  communityCounts?: Record<string, number>;
  /** Badge click: open the LED map editor on its Community tab. */
  onOpenCommunity?: (id: string) => void;
  /** FW Control state for the HYTE SmartHub group (default false). */
  smartHubFirmwareControl?: boolean;
  /** Toggle FW Control for the HYTE SmartHub. */
  onSetSmartHubFirmwareControl?: (enabled: boolean) => void;
  /** When true, Lian Li device cards are shown in the firmwareControlled (dimmed) state. */
  lianLiFirmwareActive?: boolean;
  /** Renders a dashed "add smart lights" entry at the bottom of the list. */
  onOpenSmartLights?: () => void;
  presets: LayoutPreset[];
  layoutActiveId: string | null;
  presetCount: number;
  canUndo: boolean;
  canRedo: boolean;
  onPresetLoad: (id: string) => void;
  onPresetCreate: (name: string) => Promise<{ error: boolean; msg?: string }>;
  onPresetRename: (id: string, name: string) => void;
  onPresetDelete: (id: string) => void;
  onLayoutReset: () => void;
  onLayoutUndo: () => void;
  onLayoutRedo: () => void;
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

  // Block-level ids for the top-level SortableList: single device id for singles,
  // groupKey for groups.
  const blockIds = blocks.map(b => b.kind === 'single' ? b.device.id : b.groupKey);
  const blockMap = new Map<string, DeviceBlock>(blocks.map((b, i) => [blockIds[i], b]));

  // Single click handler so cards and zones share the exact same selection
  // semantics as the canvas: plain click = single-replace, Cmd/Ctrl+click =
  // toggle this id's membership in the set.
  const handleZoneSelect = (id: string, additive: boolean) => {
    if (additive) {
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

  const noticeFor = (d: LightingDevice): string | undefined => {
    const key = lightingDeviceNoticeKey(d);
    return key ? t(key) : undefined;
  };

  const renderCard = (d: LightingDevice, indent: boolean, displayName?: string, fwControlled?: boolean, drag?: SortableRowArgs) => (
    <ZoneCard
      key={d.id}
      device={d}
      displayName={displayName}
      selected={selectedIds.has(d.id)}
      indent={indent}
      onSelect={additive => handleZoneSelect(d.id, additive)}
      onTogglePower={() => onTogglePower(d.id)}
      onToggleControlled={() => onToggleControlled(d.id)}
      onOpenSettings={() => onOpenSettings(d.id)}
      drag={drag}
      communityCount={communityCounts?.[d.id]}
      onOpenCommunity={onOpenCommunity ? () => onOpenCommunity(d.id) : undefined}
      firmwareControlled={fwControlled || (!!lianLiFirmwareActive && d.id.startsWith('lianli:'))}
      // Grouped members carry the notice on their group header instead.
      notice={indent ? undefined : noticeFor(d)}
    />
  );

  const renderBlock = (block: DeviceBlock, a: SortableRowArgs | null) => {
    if (block.kind === 'single') return renderCard(block.device, false, undefined, undefined, a ?? undefined);
    const { groupKey, label, isBrand, isSmartHub, devices: members } = block;
    const groupOn = members.some(z => z.ledsOn);
    const handleToggle = () => { const target = !groupOn; for (const z of members) onSetPower(z.id, target); };
    const groupControlled = members.some(z => z.controlled !== false);
    const handleToggleControlled = () => { const target = !groupControlled; for (const z of members) onSetControlled(z.id, target); };
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
          data-no-dnd
          onClick={e => { e.stopPropagation(); onSetSmartHubFirmwareControl(!fwOn); }}
        >
          <Cpu />
        </button>
      </HoverTooltip>
    ) : undefined;
    const memberIds = members.map(d => d.id);
    return (
      <MotherboardGroup key={groupKey} parentName={label} ariaLabel={isBrand ? label : undefined}
        groupOn={groupOn} onTogglePower={handleToggle}
        groupControlled={groupControlled} onToggleControlled={handleToggleControlled}
        collapsed={isCollapsed(groupKey)} onToggleCollapsed={() => toggleCollapsed(groupKey)}
        leftAction={leftAction} powerDisabled={fwOn}
        notice={noticeFor(members[0])}
        drag={a ?? undefined}>
        <SortableList
          ids={memberIds}
          onReorder={(newMemberIds) => {
            if (!onDeviceReorder) return;
            const newOrder: string[] = [];
            for (const bId of blockIds) {
              const b = blockMap.get(bId);
              if (!b) continue;
              if (b.kind === 'single') {
                newOrder.push(b.device.id);
              } else if (b.groupKey === groupKey) {
                newOrder.push(...newMemberIds);
              } else {
                newOrder.push(...b.devices.map(d => d.id));
              }
            }
            onDeviceReorder(newOrder);
          }}
          renderRow={(devId, da) => {
            const z = members.find(d => d.id === devId);
            if (!z) return null;
            return isBrand
              ? renderCard(z, true, undefined, undefined, da)
              : renderCard(z, true, stripParentPrefix(z.name, label), isSmartHub && fwOn, da);
          }}
        />
      </MotherboardGroup>
    );
  };

  return (
    <aside className={styles.devicePanel}>
      <div className={styles.deviceList}>
        {header}
        <PresetToolbar
          presets={presets}
          activeId={layoutActiveId}
          presetCount={presetCount}
          canUndo={canUndo}
          canRedo={canRedo}
          onLoad={onPresetLoad}
          onCreate={onPresetCreate}
          onRename={onPresetRename}
          onDelete={onPresetDelete}
          onReset={onLayoutReset}
          onUndo={onLayoutUndo}
          onRedo={onLayoutRedo}
        />
        {devices.length === 0 && (
          <p className={styles.deviceEmpty}>{t(lightingOff ? 'lighting.devices.selectModeHint' : 'lighting.devices.empty')}</p>
        )}
        <SortableList
          ids={blockIds}
          onReorder={(newBlockIds) => {
            if (!onDeviceReorder) return;
            const newOrder: string[] = [];
            for (const bId of newBlockIds) {
              const b = blockMap.get(bId);
              if (!b) continue;
              if (b.kind === 'single') newOrder.push(b.device.id);
              else newOrder.push(...b.devices.map(d => d.id));
            }
            onDeviceReorder(newOrder);
          }}
          renderRow={(blockId, a) => {
            const block = blockMap.get(blockId);
            if (!block) return null;
            return renderBlock(block, a);
          }}
        />
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
