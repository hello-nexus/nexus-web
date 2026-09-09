import { type ReactNode } from 'react';
import { Cpu, FolderPlus, Plus } from 'lucide-react';
import { identifyLightingDevice, type LightingDevice } from '../../../../api/lighting';
import { useTranslation } from '../../../../lib/i18n';
import { usePersistentState } from '../../../../hooks/usePersistentState';
import { ZoneCard, zoneCardSelectable, type BulkSelection } from './ZoneCard';
import { type LedPick } from './DeviceLedStrip';
import { DeviceDiscoveryCard, type DiscoveryState } from './DeviceDiscoveryCard';
import { startIdentify } from '../../../../lib/identifyFlash';
import { IDENTIFY_MS } from './zoneUtils';
import { MotherboardGroup } from './MotherboardGroup';
import { lightingDeviceNoticeKey } from './lightingDeviceNotices';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import { SortableList, type SortableRowArgs } from '../../../../components/common/SortableList/SortableList';
import { GroupedSortableList } from '../../../../components/common/SortableList/GroupedSortableList';
import { type Arrangement } from '../../../../components/common/SortableList/groupedDrag';
import { addGroup, anchorGroups, groupedRows, groupOf, MAX_DEVICE_GROUPS, moveBlock, removeGroup, renameGroup, type DeviceGroup } from '../../../../lib/deviceGroups';
import { buildDeviceBlocks, stripParentPrefix, type DeviceBlock } from './deviceBlocks';
import styles from '../LightingPage.module.scss';

/**
 * Right-side sidebar listing detected RGB devices. Native PC devices render as
 * before - flat cards, with multi-header motherboards under a collapsible group.
 * Each smart-light brand (Philips Hue, …) renders as its OWN collapsible group
 * using the same component/styling as a motherboard group: a chevron, the brand
 * name, a group power switch, and its lights as indented child cards.
 */
export function DevicePanel({ devices, allDevices, header, devicePicks, versionForSlot, ledFullscreen, selectedIds, onSetSelection, onTogglePower, onSetPower, onToggleControlled, onSetControlled, lightingOff, onOpenSettings, onOpenColorTuning, onRenameDevice, onDeviceReorder, communityCounts, onOpenCommunity, smartHubFirmwareControl, onSetSmartHubFirmwareControl, lianLiFirmwareActive, onLianLiTakeControl, onOpenSmartLights, discovery, rgbRunning = false, groups = [], onGroupsChange }: {
  devices: LightingDevice[];
  /** Optional control rendered at the top of the scrolling list (master brightness). */
  /** Every device before the Nexus-Control-off filter, so a group header can
   *  still report members the rail is hiding. Defaults to `devices`. */
  allDevices?: LightingDevice[];
  header?: ReactNode;
  /** Per-device static pick keyed by device id; it overrides what the card's
   *  LED strip samples from the effect canvas. Each pick names its own preset
   *  slot, so two devices on one effect can wear different presets. */
  devicePicks?: Readonly<Record<string, { key: string; slot: number; hex: string }>>;
  /** Content hash of one effect's slot, for thumbnail cache-busting. */
  versionForSlot?: (key: string, slot: number) => string;
  /** Static mode: strips sample the whole canvas rather than each device's rect. */
  ledFullscreen?: boolean;
  /** Device ids currently selected (single-tap → 1-element set, canvas marquee → N-element set). */
  selectedIds: Set<string>;
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
  /** Opens the colour-tuning modal scoped to this card (or, when it is part of
   *  a multi-selection, to the whole selection). */
  onOpenColorTuning?: (id: string) => void;
  /** Commits a card's new display name. Absent leaves every name a plain label. */
  onRenameDevice?: (id: string, name: string) => void;
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
  /** Switches the Lian Li hub to its per-LED 'custom' mode, handing its zones
   *  back to the engine. Drives the take-control row on those cards' menus. */
  onLianLiTakeControl?: () => void;
  /** Renders a dashed "add smart lights" entry at the bottom of the list. */
  onOpenSmartLights?: () => void;
  /** Tail card explaining a short list; absent once a mode is running. */
  discovery?: DiscoveryState;
  rgbRunning?: boolean;
  /** User-made groups, in display order. */
  groups?: DeviceGroup[];
  /** Absent leaves the rail ungroupable (no drag between groups, no add button). */
  onGroupsChange?: (groups: DeviceGroup[]) => void;
}) {
  const { t } = useTranslation();

  // Persisted per-group collapse state (survives restart via localStorage).
  // Keyed by the block key ('mb:<parentId>' / 'brand:<prefix>'); default expanded.
  const [collapsedGroups, setCollapsedGroups] = usePersistentState<string[]>('lighting.collapsedDeviceGroups', []);
  const isCollapsed = (key: string) => collapsedGroups.includes(key);
  const toggleCollapsed = (key: string) =>
    setCollapsedGroups(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

  const blocks = buildDeviceBlocks(devices);

  // Block-level ids for the top-level SortableList: single device id for singles,
  // groupKey for groups.
  const blockIds = blocks.map(b => b.kind === 'single' ? b.device.id : b.groupKey);
  const blockMap = new Map<string, DeviceBlock>(blocks.map((b, i) => [blockIds[i], b]));

  // A card's group membership is its BLOCK's: a zone inside a hardware group
  // moves with the whole block, the way dragging one does.
  const blockIdOfDevice = new Map<string, string>();
  blocks.forEach((block, i) => {
    if (block.kind === 'single') blockIdOfDevice.set(block.device.id, blockIds[i]);
    else for (const member of block.devices) blockIdOfDevice.set(member.id, blockIds[i]);
  });

  const groupMoveFor = (deviceId: string) => {
    const blockId = blockIdOfDevice.get(deviceId);
    if (!onGroupsChange || blockId === undefined) return undefined;
    const current = groupOf(groups, blockId);
    return {
      targets: groups.filter(g => g.id !== current?.id).map(g => ({ id: g.id, name: g.name })),
      onMove: (groupId: string) => onGroupsChange(moveBlock(groups, blockId, groupId, Number.MAX_SAFE_INTEGER)),
      onRemove: current
        ? { name: current.name, run: () => onGroupsChange(moveBlock(groups, blockId, null, 0)) }
        : undefined,
      onMoveToNew: groups.length < MAX_DEVICE_GROUPS
        ? () => {
            const withNew = addGroup(groups, t('lighting.devices.groupDefaultName'));
            onGroupsChange(moveBlock(withNew, blockId, withNew[withNew.length - 1].id, 0));
          }
        : undefined,
    };
  };

  // Single click handler so cards and zones share the exact same selection
  // semantics as the canvas: plain click = single-replace, Cmd/Ctrl+click =
  // toggle this id's membership in the set.
  const handleZoneSelect = (id: string, additive: boolean) => {
    if (additive) {
      const next = new Set(selectedIds);
      if (next.has(id)) {
        next.delete(id);
        // Primary follows the last remaining card in device order;
        // Set-insertion order would pick a different one.
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
    onSetSelection(new Set([id]), id);
  };

  const selectOnlyFor = (d: LightingDevice) => () => onSetSelection(new Set([d.id]), d.id);

  const noticeFor = (d: LightingDevice): string | undefined => {
    const key = lightingDeviceNoticeKey(d);
    return key ? t(key) : undefined;
  };

  // A card inside a multi-selection acts on the whole selection, the way a
  // canvas right-click on a selected frame does. Aggregates read "any member
  // still is", so one press lands every member on the same state.
  const selectedDevices = selectedIds.size >= 2 ? devices.filter(d => selectedIds.has(d.id)) : [];
  const bulkFor = (d: LightingDevice): BulkSelection | undefined => {
    if (selectedDevices.length < 2 || !selectedIds.has(d.id)) return undefined;
    return {
      count: selectedDevices.length,
      identifyCount: selectedDevices.filter(x => x.ledCount > 0).length,
      tunableCount: selectedDevices.filter(zoneCardSelectable).length,
      controlled: selectedDevices.some(x => x.controlled !== false),
      ledsOn: selectedDevices.some(x => x.ledsOn),
      setControlled: (controlled: boolean) => selectedDevices.forEach(x => onSetControlled(x.id, controlled)),
      setPower: (on: boolean) => selectedDevices.forEach(x => onSetPower(x.id, on)),
      identify: () => selectedDevices
        .filter(x => x.ledCount > 0)
        .forEach(x => {
          startIdentify(x.id, IDENTIFY_MS);
          identifyLightingDevice(x.id, IDENTIFY_MS).catch(() => { /* silent */ });
        }),
    };
  };

  const ledPickFor = (id: string): LedPick | undefined => {
    const pick = devicePicks?.[id];
    if (!pick) return undefined;
    return { ...pick, version: versionForSlot?.(pick.key, pick.slot) ?? '0' };
  };

  const renderCard = (d: LightingDevice, indent: boolean, displayName?: string, fwControlled?: boolean, drag?: SortableRowArgs) => (
    <ZoneCard
      key={d.id}
      device={d}
      displayName={displayName}
      selected={selectedIds.has(d.id)}
      ledPick={ledPickFor(d.id)}
      ledFullscreen={ledFullscreen}
      indent={indent}
      onSelect={additive => handleZoneSelect(d.id, additive)}
      onSelectOnly={selectOnlyFor(d)}
      onTogglePower={() => onTogglePower(d.id)}
      onToggleControlled={() => onToggleControlled(d.id)}
      onOpenSettings={() => onOpenSettings(d.id)}
      onOpenColorTuning={onOpenColorTuning ? () => onOpenColorTuning(d.id) : undefined}
      onRename={onRenameDevice ? name => onRenameDevice(d.id, name) : undefined}
      drag={drag}
      communityCount={communityCounts?.[d.id]}
      onOpenCommunity={onOpenCommunity ? () => onOpenCommunity(d.id) : undefined}
      firmwareControlled={fwControlled || (!!lianLiFirmwareActive && d.id.startsWith('lianli:'))}
      // Only the Lian Li hub exposes a mode switch back to per-LED control;
      // the SmartHub's FW Control lives on its group header instead.
      onTakeControl={!!lianLiFirmwareActive && d.id.startsWith('lianli:') ? onLianLiTakeControl : undefined}
      // Grouped members carry the notice on their group header instead.
      notice={indent ? undefined : noticeFor(d)}
      bulk={bulkFor(d)}
      groupMove={groupMoveFor(d.id)}
    />
  );

  const renderBlock = (block: DeviceBlock, a: SortableRowArgs | null) => {
    if (block.kind === 'single') return renderCard(block.device, false, undefined, undefined, a ?? undefined);
    const { groupKey, label, stripLabel, parentDeviceId, isBrand, isSmartHub, devices: members } = block;
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
        onRename={onRenameDevice && parentDeviceId ? name => onRenameDevice(parentDeviceId, name) : undefined}
        onResetName={onRenameDevice && parentDeviceId && members[0]?.parentName != null
          ? () => onRenameDevice(parentDeviceId, '')
          : undefined}
        groupOn={groupOn} onTogglePower={handleToggle}
        groupControlled={groupControlled} onToggleControlled={handleToggleControlled}
        collapsed={isCollapsed(groupKey)} onToggleCollapsed={() => toggleCollapsed(groupKey)}
        leftAction={leftAction} hideLights={fwOn}
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
              : renderCard(z, true, stripParentPrefix(z.name, stripLabel), isSmartHub && fwOn, da);
          }}
        />
      </MotherboardGroup>
    );
  };

  // Rail arrangement: hardware blocks that no user group claims stay at the top
  // level, each user group sits where its first present member sat, and a group
  // row's members are the blocks it owns. A hardware group is ONE block here, so
  // dragging it moves the whole thing and its zones can never be split.
  const grouped = groupedRows(blocks, b => (b.kind === 'single' ? b.device.id : b.groupKey), groups);
  const arrangement: Arrangement = {
    rowIds: grouped.map(r => r.id),
    groupMembers: Object.fromEntries(groups.map(g => [
      g.id,
      grouped.find(r => r.kind === 'group' && r.id === g.id)?.kind === 'group'
        ? (grouped.find(r => r.id === g.id) as { blocks: DeviceBlock[] }).blocks
            .map(b => b.kind === 'single' ? b.device.id : b.groupKey)
        : [],
    ])),
  };

  // One drop rewrites both halves: which group holds which block, and the flat
  // device order the page persists.
  const handleArrange = (next: Arrangement) => {
    if (onGroupsChange) {
      // anchorGroups records the row each group now follows, so a group emptied
      // by this very drop keeps its slot instead of sliding to the tail.
      onGroupsChange(anchorGroups(
        next.rowIds
          .filter(id => id in next.groupMembers)
          .map(id => ({
            ...(groups.find(g => g.id === id) ?? { id, name: '' }),
            members: next.groupMembers[id] ?? [],
          })),
        next.rowIds,
      ));
    }
    if (!onDeviceReorder) return;
    const expand = (blockId: string): string[] => {
      const b = blockMap.get(blockId);
      if (!b) return [];
      return b.kind === 'single' ? [b.device.id] : b.devices.map(d => d.id);
    };
    const order: string[] = [];
    for (const rowId of next.rowIds) {
      if (rowId in next.groupMembers) {
        for (const memberId of next.groupMembers[rowId] ?? []) order.push(...expand(memberId));
      } else {
        order.push(...expand(rowId));
      }
    }
    onDeviceReorder(order);
  };

  const every = allDevices ?? devices;
  const hidingUncontrolled = every.length > devices.length;
  // The same block keying over the unfiltered list, so a group header can
  // resolve members the rail is currently hiding.
  const allBlocks = hidingUncontrolled ? buildDeviceBlocks(every) : blocks;
  const allByBlockId = new Map<string, LightingDevice[]>(allBlocks.map(b =>
    b.kind === 'single' ? [b.device.id, [b.device]] : [b.groupKey, b.devices]));

  const canAddGroup = onGroupsChange !== undefined && groups.length < MAX_DEVICE_GROUPS;

  return (
    <aside className={styles.devicePanel}>
      <div className={styles.deviceList}>
        {header}
        {devices.length === 0 && (
          <p className={styles.deviceEmpty}>{t(lightingOff ? 'lighting.devices.selectModeHint' : 'lighting.devices.empty')}</p>
        )}
        <GroupedSortableList
          arrangement={arrangement}
          onArrange={handleArrange}
          renderBlock={(blockId, a) => {
            const block = blockMap.get(blockId);
            if (!block) return null;
            return renderBlock(block, a);
          }}
          renderGroup={(groupId, a, children, isDropTarget) => {
            const group = groups.find(g => g.id === groupId);
            if (!group) return null;
            const members = (arrangement.groupMembers[groupId] ?? [])
              .flatMap(id => blockMap.get(id)?.kind === 'single'
                ? [(blockMap.get(id) as { device: LightingDevice }).device]
                : (blockMap.get(id) as { devices: LightingDevice[] } | undefined)?.devices ?? []);
            const groupOn = members.some(z => z.ledsOn);
            const groupControlled = members.some(z => z.controlled !== false);
            // Counted off the unfiltered list, so a group that is nothing but
            // Nexus-Control-off devices goes with them while one the user just
            // made stays as a drop target.
            const groupAll = (groups.find(g => g.id === groupId)?.members ?? [])
              .flatMap(b => allByBlockId.get(b) ?? []);
            if (hidingUncontrolled && groupAll.length > 0
              && groupAll.every(d => d.controlled === false)) return null;
            return (
              <MotherboardGroup
                parentName={group.name}
                ariaLabel={group.name}
                groupOn={groupOn}
                onTogglePower={() => { const target = !groupOn; for (const z of members) onSetPower(z.id, target); }}
                groupControlled={groupControlled}
                onToggleControlled={() => { const target = !groupControlled; for (const z of members) onSetControlled(z.id, target); }}
                collapsed={isCollapsed(groupId)}
                onToggleCollapsed={() => toggleCollapsed(groupId)}
                onRename={name => onGroupsChange?.(renameGroup(groups, groupId, name))}
                onDelete={() => onGroupsChange?.(removeGroup(groups, groupId))}
                dropTarget={isDropTarget}
                empty={members.length === 0}
                count={members.length}
                hasUncontrolled={groupAll.some(d => d.controlled === false)}
                drag={a}
              >
                {children}
              </MotherboardGroup>
            );
          }}
        />
        {discovery && <DeviceDiscoveryCard state={discovery} rgbRunning={rgbRunning} />}
        {canAddGroup && (
          <button
            type="button"
            className={styles.addSmartLights}
            onClick={() => onGroupsChange?.(addGroup(groups, t('lighting.devices.groupDefaultName')))}
          >
            <FolderPlus size={22} aria-hidden />
            <span>{t('lighting.devices.groupAdd')}</span>
          </button>
        )}
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
