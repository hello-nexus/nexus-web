import { type ReactNode } from 'react';
import { FolderPlus, Plus } from 'lucide-react';
import { identifyLightingDevice, type LightingDevice } from '../../../../api/lighting';
import { useTranslation } from '../../../../lib/i18n';
import { usePersistentState } from '../../../../hooks/usePersistentState';
import { ZoneCard, ZoneCardStack, zoneCardSelectable, zoneCardUnavailable, type BulkSelection, type DeviceLock, type StackPosition } from './ZoneCard';
import { type LedPick } from './DeviceLedStrip';
import { DeviceDiscoveryCard, type DiscoveryState } from './DeviceDiscoveryCard';
import { startIdentify } from '../../../../lib/identifyFlash';
import { IDENTIFY_MS } from './zoneUtils';
import { MotherboardGroup } from './MotherboardGroup';
import { lightingDeviceNoticeKey } from './lightingDeviceNotices';
import { type SortableRowArgs } from '../../../../components/common/SortableList/SortableList';
import { GroupedSortableList } from '../../../../components/common/SortableList/GroupedSortableList';
import { type Arrangement } from '../../../../components/common/SortableList/groupedDrag';
import { DeviceGroupIcon } from '../../../../components/common/DeviceGroupIcon/DeviceGroupIcon';
import { type GroupMove } from '../../../../components/common/DeviceCanvas/groupMenuItems';
import {
  addGroup, applyArrangement, arrangementOf, canGroupIn, groupedRows, groupOf, groupRows, groupsIn, hardwareContainerOf,
  MAX_DEVICE_GROUPS, moveBlock, removeGroup, renameGroup, type DeviceGroup,
} from '../../../../lib/deviceGroups';
import { blockKey, buildDeviceBlocks, stripParentPrefix, type DeviceBlock, type ZoneBlock } from './deviceBlocks';
import { canStack, isStackedSet, stackDevices, stackedWith, stackOf, rowOfDevice as rowOfDeviceIn, unstackDevices, withStacked, type DeviceStack } from './deviceStacks';
import { stackSlotOf } from '../../../../lib/stackSlots';
import styles from '../LightingPage.module.scss';

/**
 * Right-side sidebar listing detected RGB devices. Native PC devices render as
 * before - flat cards, with multi-header motherboards under a collapsible group
 * and one device's zones (the keeb's keys + underglow) stacked into one card.
 * Each smart-light brand (Philips Hue, …) renders as its OWN collapsible group
 * using the same component/styling as a motherboard group: a chevron, the brand
 * name, a group power switch, and its lights as indented child cards.
 */
export function DevicePanel({ devices, allDevices, hidingUncontrolled = false, header, devicePicks, versionForSlot, ledFullscreen, lockable = false, onSetLock, lockFlash, selectedIds, onSetSelection, onTogglePower, onSetPower, onToggleControlled, onSetControlled, lightingOff, onOpenSettings, onOpenColorTuning, onRenameDevice, onDeviceReorder, communityCounts, onOpenCommunity, lianLiFirmwareActive, onLianLiTakeControl, onOpenSmartLights, discovery, rgbRunning = false, groups = [], onGroupsChange, stacks = [], onStacksChange }: {
  devices: LightingDevice[];
  /** Optional control rendered at the top of the scrolling list (master brightness). */
  /** Every device before the Nexus-Control-off filter, so a group header can
   *  still report members the rail is hiding. Defaults to `devices`. */
  allDevices?: LightingDevice[];
  /** True while the eye is hiding Nexus-Control-off devices. Passed rather than
   *  inferred from the two list lengths, which are equal whenever nothing is
   *  uncontrolled and so cannot tell the two states apart. */
  hidingUncontrolled?: boolean;
  header?: ReactNode;
  /** Per-device static pick keyed by device id; it overrides what the card's
   *  LED strip samples from the effect canvas. Each pick names its own preset
   *  slot, so two devices on one effect can wear different presets. */
  devicePicks?: Readonly<Record<string, { key: string; slot: number; hex: string; locked?: boolean }>>;
  /** Content hash of one effect's slot, for thumbnail cache-busting. */
  versionForSlot?: (key: string, slot: number) => string;
  /** Static mode: strips sample the whole canvas rather than each device's rect. */
  ledFullscreen?: boolean;
  /** Static mode: a card with its own pick can be locked onto it. Outside
   *  Static the menu offers only Unlock, on cards that are locked. */
  lockable?: boolean;
  /** Sets the colour lock on these cards. Absent leaves every card lock-less. */
  onSetLock?: (ids: string[], locked: boolean) => void;
  /** A pick just aimed at these locked cards: each flashes its badge. `seq`
   *  changes per burst so the same card can flash again. */
  lockFlash?: { ids: ReadonlySet<string>; seq: number };
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
  /** Cards stacked to one frame and one selection. */
  stacks?: DeviceStack[];
  /** Absent leaves the rail unstackable. */
  onStacksChange?: (stacks: DeviceStack[]) => void;
}) {
  const { t } = useTranslation();

  // Persisted per-group collapse state (survives restart via localStorage).
  // Keyed by the block key ('mb:<parentId>' / 'brand:<prefix>'); default expanded.
  const [collapsedGroups, setCollapsedGroups] = usePersistentState<string[]>('lighting.collapsedDeviceGroups', []);
  const isCollapsed = (key: string) => collapsedGroups.includes(key);
  const toggleCollapsed = (key: string) =>
    setCollapsedGroups(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

  const blocks = buildDeviceBlocks(devices);
  const every = allDevices ?? devices;

  // Block-level ids for the top-level list: single device id for singles,
  // groupKey for stacks and hardware groups.
  const blockIds = blocks.map(blockKey);
  const blockMap = new Map<string, DeviceBlock>(blocks.map((b, i) => [blockIds[i], b]));
  const devicesOfBlock = (b: DeviceBlock): LightingDevice[] => b.kind === 'single' ? [b.device] : b.devices;
  const devicesOfBlockId = (id: string): LightingDevice[] => { const b = blockMap.get(id); return b ? devicesOfBlock(b) : []; };

  // A card's block: a zone inside a hardware group moves with the whole block,
  // the way dragging one does.
  const blockIdOfDevice = new Map<string, string>();
  blocks.forEach((block, i) => {
    for (const member of devicesOfBlock(block)) blockIdOfDevice.set(member.id, blockIds[i]);
  });

  // Rail arrangement: hardware blocks that no user group claims stay at the top
  // level, each user group sits where the user dropped it, and a group row's
  // members are the blocks and groups it holds. A hardware group is ONE block
  // here, so dragging it moves the whole thing and its zones can never be
  // split; the groups a user makes INSIDE it live in its own inner list.
  const rootRows = groupedRows(blocks, blockKey, groups);
  const arrangement = arrangementOf(rootRows);
  // Each hardware group's inner list: its zone rows plus the user groups whose
  // parent is the group's key.
  const innerArrangements = new Map<string, Arrangement>();
  for (const block of blocks) {
    if (block.kind !== 'group') continue;
    innerArrangements.set(block.groupKey, arrangementOf(groupedRows(block.blocks, blockKey, groups, block.groupKey)));
  }
  const siblingsIn = (container: string | null): readonly string[] => {
    if (container === null) return arrangement.rowIds;
    if (container in arrangement.groupMembers) return arrangement.groupMembers[container];
    const inner = innerArrangements.get(container);
    if (inner) return inner.rowIds;
    for (const arr of innerArrangements.values()) {
      if (container in arr.groupMembers) return arr.groupMembers[container];
    }
    return [];
  };

  const rowOfDevice = (deviceId: string) => rowOfDeviceIn(blocks, groups, deviceId);

  // Stack placement for a set of cards: unstack when they already are one stack,
  // stack when their rows share a container. A header stacks its whole group
  // whatever its rows' containers, since the group is the container.
  const stackFor = (deviceIds: readonly string[], name = '', whole = false): { stack?: () => void; unstack?: () => void } => {
    if (!onStacksChange || deviceIds.length < 2) return {};
    if (isStackedSet(stacks, deviceIds)) return { unstack: () => onStacksChange(unstackDevices(stacks, deviceIds)) };
    if (!whole && !canStack(blocks, groups, deviceIds)) return {};
    return { stack: () => onStacksChange(stackDevices(stacks, deviceIds, name)) };
  };
  // The header shape: the stack row counts the members it would take.
  const headerStack = (ids: readonly string[], name: string) => {
    const actions = stackFor(ids, name, true);
    return { stack: actions.stack ? { count: ids.length, run: actions.stack } : undefined, unstack: actions.unstack };
  };
  const stackBadge = (d: LightingDevice) => {
    const stack = stackOf(stacks, d.id);
    return stack ? { count: stack.members.length } : undefined;
  };
  // Stacked cards are controlled together: a toggle on one lands on them all.
  const togglePowerFor = (d: LightingDevice) => {
    const members = stackedWith(stacks, d.id);
    if (members.length < 2) return onTogglePower(d.id);
    const target = !d.ledsOn;
    for (const m of members) onSetPower(m, target);
  };
  const toggleControlledFor = (d: LightingDevice) => {
    const members = stackedWith(stacks, d.id);
    if (members.length < 2) return onToggleControlled(d.id);
    const target = d.controlled === false;
    for (const m of members) onSetControlled(m, target);
  };

  // Wraps the rows of `deviceIds` in a new group where they sit, when every
  // one shares a container with room under the nesting limit.
  const groupDevices = (deviceIds: readonly string[]): (() => void) | undefined => {
    if (!onGroupsChange) return undefined;
    const rows = deviceIds.map(rowOfDevice);
    const first = rows[0];
    if (!first || rows.some(r => r === undefined || r.container !== first.container)) return undefined;
    if (!canGroupIn(groups, first.container)) return undefined;
    const rowIds = [...new Set(rows.map(r => r!.rowId))];
    return () => onGroupsChange(groupRows(groups, t('lighting.devices.groupDefaultName'), first.container, rowIds, siblingsIn(first.container)));
  };

  // A hardware group is a group in its own right: it only enters a top-level
  // group, and none at all while it holds a group of its own.
  const blockGroupMove = (blockId: string): GroupMove | undefined => {
    if (!onGroupsChange) return undefined;
    const current = groupOf(groups, blockId);
    const holds = groupsIn(groups, blockId).length > 0;
    const targets = holds ? [] : groups.filter(g => g.id !== current?.id && g.parent == null);
    return {
      targets: targets.map(g => ({ id: g.id, name: g.name })),
      onMove: (groupId: string) => onGroupsChange(moveBlock(groups, blockId, groupId, Number.MAX_SAFE_INTEGER)),
      onRemove: current
        ? { name: current.name, run: () => onGroupsChange(moveBlock(groups, blockId, null, 0)) }
        : undefined,
      onGroup: !holds && current === null && canGroupIn(groups, null)
        ? () => onGroupsChange(groupRows(groups, t('lighting.devices.groupDefaultName'), null, [blockId], arrangement.rowIds))
        : undefined,
    };
  };

  const groupMoveFor = (deviceId: string): GroupMove | undefined => {
    const row = rowOfDevice(deviceId);
    if (!onGroupsChange || !row) return undefined;
    const current = groupOf(groups, row.rowId);
    // A row moves among the groups of its own hardware group, or, outside one,
    // among the groups that sit in none.
    const reachable = groups.filter(g => g.id !== current?.id && hardwareContainerOf(groups, g.id) === row.hardware);
    return {
      targets: reachable.map(g => ({ id: g.id, name: g.name })),
      onMove: (groupId: string) => onGroupsChange(moveBlock(groups, row.rowId, groupId, Number.MAX_SAFE_INTEGER)),
      onRemove: current
        ? { name: current.name, run: () => onGroupsChange(moveBlock(groups, row.rowId, null, 0)) }
        : undefined,
      onGroup: groupDevices([deviceId]),
    };
  };

  // Primary after a removal follows the last remaining card in device order;
  // Set-insertion order would pick a different one.
  const lastSelected = (next: Set<string>): string | null => {
    for (let i = devices.length - 1; i >= 0; i--) {
      if (next.has(devices[i].id)) return devices[i].id;
    }
    return null;
  };

  // Single click handler so cards and zones share the exact same selection
  // semantics as the canvas: plain click = single-replace, Cmd/Ctrl+click =
  // toggle this id's membership in the set. Clicking the one card already
  // selected clears the selection, matching the cooling page's fan cards -
  // otherwise a lone selection can only be dropped from the canvas.
  const handleZoneSelect = (id: string, additive: boolean) => {
    const stacked = stackedWith(stacks, id);
    if (additive) {
      const next = new Set(selectedIds);
      if (next.has(id)) {
        for (const m of stacked) next.delete(m);
        onSetSelection(next, lastSelected(next));
      } else {
        for (const m of stacked) next.add(m);
        onSetSelection(next, id);
      }
      return;
    }
    if (selectedIds.size === stacked.length && stacked.every(m => selectedIds.has(m))) {
      onSetSelection(new Set(), null);
      return;
    }
    onSetSelection(new Set(stacked), id);
  };

  // A split card's header stands for every zone under it: the same two
  // gestures as a card, over the whole set. Additive toggles the set as one,
  // so a device already fully selected comes out.
  const handleStackSelect = (zoneIds: string[], additive: boolean) => {
    const ids = [...withStacked(stacks, zoneIds)];
    if (!additive) {
      if (selectedIds.size === ids.length && ids.every(id => selectedIds.has(id))) {
        onSetSelection(new Set(), null);
        return;
      }
      onSetSelection(new Set(ids), ids[0]);
      return;
    }
    const next = new Set(selectedIds);
    if (ids.every(id => next.has(id))) {
      ids.forEach(id => next.delete(id));
      onSetSelection(next, lastSelected(next));
    } else {
      ids.forEach(id => next.add(id));
      onSetSelection(next, ids[0]);
    }
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
      // deviceId falls back to the card id, so cards without one are each
      // their own device and a mixed selection is correctly not one.
      oneDevice: new Set(selectedDevices.map(x => x.deviceId || x.id)).size === 1,
      setControlled: (controlled: boolean) => selectedDevices.forEach(x => onSetControlled(x.id, controlled)),
      setPower: (on: boolean) => selectedDevices.forEach(x => onSetPower(x.id, on)),
      identify: () => selectedDevices
        .filter(x => x.ledCount > 0)
        .forEach(x => {
          startIdentify(x.id, IDENTIFY_MS);
          identifyLightingDevice(x.id, IDENTIFY_MS).catch(() => { /* silent */ });
        }),
      group: groupDevices(selectedDevices.map(x => x.id)),
      ...stackFor(selectedDevices.map(x => x.id)),
      ...lockBulkFor(selectedDevices),
    };
  };

  // The same gate a card's own click has, over a group's members.
  const fwOf = (d: LightingDevice) => !!lianLiFirmwareActive && d.id.startsWith('lianli:');
  const selectAllFor = (members: readonly LightingDevice[]) => {
    const ids = members.filter(z => !zoneCardUnavailable(z) && !fwOf(z)).map(z => z.id);
    return ids.length > 0 ? { count: ids.length, run: () => onSetSelection(new Set(ids), ids[0]) } : undefined;
  };

  const ledPickFor = (id: string): LedPick | undefined => {
    const pick = devicePicks?.[id];
    if (!pick) return undefined;
    return { ...pick, version: versionForSlot?.(pick.key, pick.slot) ?? '0' };
  };

  // The members each lock row reaches: Lock the unlocked cards with a pick
  // (only where a lock can be set), Unlock the locked ones.
  const lockBulkFor = (members: readonly LightingDevice[]): Pick<BulkSelection, 'lockCount' | 'unlockCount' | 'setLocked'> => {
    if (!onSetLock) return {};
    const lockableIds = lockable ? members.filter(x => devicePicks?.[x.id] && !devicePicks[x.id].locked).map(x => x.id) : [];
    const lockedIds = members.filter(x => devicePicks?.[x.id]?.locked).map(x => x.id);
    return {
      lockCount: lockableIds.length,
      unlockCount: lockedIds.length,
      setLocked: (locked: boolean) => onSetLock(locked ? lockableIds : lockedIds, locked),
    };
  };

  const lockFor = (id: string): DeviceLock | undefined => {
    if (!onSetLock) return undefined;
    const pick = devicePicks?.[id];
    return {
      locked: !!pick?.locked, lockable, hasPick: !!pick,
      setLocked: locked => onSetLock([id], locked),
      flashSeq: lockFlash?.ids.has(id) ? lockFlash.seq : 0,
    };
  };

  const renderCard = (d: LightingDevice, indent: boolean, displayName?: string, drag?: SortableRowArgs, stacked?: StackPosition) => (
    <ZoneCard
      key={d.id}
      device={d}
      displayName={displayName}
      stacked={stacked}
      selected={selectedIds.has(d.id)}
      ledPick={ledPickFor(d.id)}
      ledFullscreen={ledFullscreen}
      indent={indent}
      onSelect={additive => handleZoneSelect(d.id, additive)}
      onSelectOnly={selectOnlyFor(d)}
      onTogglePower={() => togglePowerFor(d)}
      onToggleControlled={() => toggleControlledFor(d)}
      onOpenSettings={() => onOpenSettings(d.id)}
      onOpenColorTuning={onOpenColorTuning ? () => onOpenColorTuning(d.id) : undefined}
      onRename={onRenameDevice ? name => onRenameDevice(d.id, name) : undefined}
      drag={drag}
      communityCount={communityCounts?.[d.id]}
      onOpenCommunity={onOpenCommunity ? () => onOpenCommunity(d.id) : undefined}
      firmwareControlled={fwOf(d)}
      onTakeControl={fwOf(d) ? onLianLiTakeControl : undefined}
      // Grouped members carry the notice on their group header instead.
      notice={indent ? undefined : noticeFor(d)}
      bulk={bulkFor(d)}
      groupMove={groupMoveFor(d.id)}
      inStack={stackBadge(d)}
      stackSlot={stackSlotOf(stacks, d.id)}
      lock={lockFor(d.id)}
      onUnstack={stackOf(stacks, d.id) ? () => onStacksChange?.(unstackDevices(stacks, [d.id])) : undefined}
    />
  );

  // The stack carries the drag, so any zone drags the whole device. Power and
  // Nexus Control routes are card-keyed, so the header's toggles fan out over
  // the zones the way the group header's do.
  const renderStack = (block: Extract<ZoneBlock, { kind: 'split' }>, drag?: SortableRowArgs, indent = false) => {
    const members = block.devices;
    const last = members.length - 1;
    // The same gate a card's own click has.
    const selectable = members.filter(z => !zoneCardUnavailable(z) && !fwOf(z)).map(z => z.id);
    const stackOn = members.some(z => z.ledsOn);
    const stackControlled = members.some(z => z.controlled !== false);
    const flashable = members.filter(z => z.ledCount > 0);
    // A rename is keyed on the device id and comes back as deviceName; a
    // service before that field names a standalone device through its parent
    // rename, which is the same id for the keeb.
    const renamed = members[0]?.deviceName != null
      || (members[0]?.parentDeviceId === block.deviceId && members[0]?.parentName != null);
    return (
      <ZoneCardStack
        key={block.groupKey}
        name={block.label}
        selected={members.some(z => selectedIds.has(z.id))}
        zoneCount={members.length}
        drag={drag}
        onSelect={selectable.length > 0 ? additive => handleStackSelect(selectable, additive) : undefined}
        menu={{
          onIdentify: flashable.length > 0 ? () => {
            for (const z of flashable) {
              startIdentify(z.id, IDENTIFY_MS);
              identifyLightingDevice(z.id, IDENTIFY_MS).catch(() => { /* silent */ });
            }
          } : undefined,
          // The editor lists every zone of the device whichever one opens it.
          onOpenSettings: () => onOpenSettings(members[0].id),
          on: stackOn,
          onTogglePower: () => { const target = !stackOn; for (const z of members) onSetPower(z.id, target); },
          controlled: stackControlled,
          onToggleControlled: () => { const target = !stackControlled; for (const z of members) onSetControlled(z.id, target); },
          onRename: onRenameDevice ? name => onRenameDevice(block.deviceId, name) : undefined,
          onResetName: onRenameDevice && renamed ? () => onRenameDevice(block.deviceId, '') : undefined,
          ...stackFor(members.map(z => z.id), block.label, true),
        }}
      >
        {members.map((z, i) => renderCard(z, indent, stripParentPrefix(z.name, block.stripLabel), undefined, i === last ? 'last' : 'inner'))}
      </ZoneCardStack>
    );
  };

  const renderBlock = (block: DeviceBlock, a: SortableRowArgs | null) => {
    if (block.kind === 'single') return renderCard(block.device, false, undefined, a ?? undefined);
    if (block.kind === 'split') return renderStack(block, a ?? undefined);
    const { groupKey, label, stripLabel, parentDeviceId, isBrand, devices: members, blocks: rows } = block;
    const groupOn = members.some(z => z.ledsOn);
    const handleToggle = () => { const target = !groupOn; for (const z of members) onSetPower(z.id, target); };
    const groupControlled = members.some(z => z.controlled !== false);
    const handleToggleControlled = () => { const target = !groupControlled; for (const z of members) onSetControlled(z.id, target); };
    const inner = innerArrangements.get(groupKey) ?? { rowIds: rows.map(blockKey), groupMembers: {} };
    const rowById = new Map(rows.map(r => [blockKey(r), r]));
    const devicesOfRowId = (id: string): LightingDevice[] => { const r = rowById.get(id); return r ? devicesOfBlock(r) : []; };
    const devicesOfRows = (ids: readonly string[]): LightingDevice[] => ids.flatMap(id => id in inner.groupMembers
      ? devicesOfRows(inner.groupMembers[id])
      : devicesOfRowId(id));
    const renderRow = (rowId: string, da: SortableRowArgs) => {
      const row = rowById.get(rowId);
      if (!row) return null;
      if (row.kind === 'split') return renderStack(row, da, true);
      return isBrand
        ? renderCard(row.device, true, undefined, da)
        : renderCard(row.device, true, stripParentPrefix(row.device.name, stripLabel), da);
    };
    // One drop rewrites the groups inside this hardware group and the flat
    // device order the page persists: this group's zones in their new order,
    // every other block as it was.
    const handleInnerArrange = (next: Arrangement) => {
      onGroupsChange?.(applyArrangement(groups, next, groupKey));
      if (!onDeviceReorder) return;
      const expandRow = (id: string): string[] => id in next.groupMembers
        ? (next.groupMembers[id] ?? []).flatMap(expandRow)
        : devicesOfRowId(id).map(d => d.id);
      const newMemberIds = next.rowIds.flatMap(expandRow);
      onDeviceReorder(blockIds.flatMap(bId => {
        const b = blockMap.get(bId);
        if (!b) return [];
        return b.kind === 'group' && b.groupKey === groupKey ? newMemberIds : devicesOfBlock(b).map(d => d.id);
      }));
    };
    return (
      <MotherboardGroup key={groupKey} parentName={label} ariaLabel={isBrand ? label : undefined}
        icon={<DeviceGroupIcon id={parentDeviceId ?? groupKey} iconType={members[0]?.iconType} />}
        onRename={onRenameDevice && parentDeviceId ? name => onRenameDevice(parentDeviceId, name) : undefined}
        onResetName={onRenameDevice && parentDeviceId && members[0]?.parentName != null
          ? () => onRenameDevice(parentDeviceId, '')
          : undefined}
        groupOn={groupOn} onTogglePower={handleToggle}
        groupControlled={groupControlled} onToggleControlled={handleToggleControlled}
        collapsed={isCollapsed(groupKey)} onToggleCollapsed={() => toggleCollapsed(groupKey)}
        notice={noticeFor(members[0])}
        onSelectAll={selectAllFor(members)}
        groupMove={blockGroupMove(groupKey)}
        {...headerStack(members.map(z => z.id), label)}
        drag={a ?? undefined}>
        <GroupedSortableList
          arrangement={inner}
          onArrange={handleInnerArrange}
          renderBlock={renderRow}
          renderGroup={(groupId, ga, children, isDropTarget) => {
            const group = groups.find(g => g.id === groupId);
            if (!group) return null;
            const held = devicesOfRows(inner.groupMembers[groupId] ?? []);
            const heldOn = held.some(z => z.ledsOn);
            const heldControlled = held.some(z => z.controlled !== false);
            // Off the unfiltered list, the same way the top-level group counts.
            const heldAll = group.members.flatMap(m => every.filter(d => d.id === m || `mb:${d.deviceId || d.id}` === m));
            if (hidingUncontrolled && heldAll.length > 0 && heldAll.every(d => d.controlled === false)) return null;
            return (
              <MotherboardGroup
                parentName={group.name}
                ariaLabel={group.name}
                groupOn={heldOn}
                onTogglePower={() => { const target = !heldOn; for (const z of held) onSetPower(z.id, target); }}
                groupControlled={heldControlled}
                onToggleControlled={() => { const target = !heldControlled; for (const z of held) onSetControlled(z.id, target); }}
                collapsed={isCollapsed(groupId)}
                onToggleCollapsed={() => toggleCollapsed(groupId)}
                onRename={name => onGroupsChange?.(renameGroup(groups, groupId, name))}
                onDelete={() => onGroupsChange?.(removeGroup(groups, groupId))}
                onSelectAll={selectAllFor(held)}
                {...headerStack(held.map(z => z.id), group.name)}
                dropTarget={isDropTarget}
                empty={held.length === 0}
                count={held.length}
                hasUncontrolled={heldAll.some(d => d.controlled === false)}
                drag={ga}
              >
                {children}
              </MotherboardGroup>
            );
          }}
        />
      </MotherboardGroup>
    );
  };

  // One drop rewrites both halves: which group holds which row, and the flat
  // device order the page persists.
  const handleArrange = (next: Arrangement) => {
    onGroupsChange?.(applyArrangement(groups, next, null));
    if (!onDeviceReorder) return;
    const expand = (id: string): string[] => id in next.groupMembers
      ? (next.groupMembers[id] ?? []).flatMap(expand)
      : devicesOfBlockId(id).map(d => d.id);
    onDeviceReorder(next.rowIds.flatMap(expand));
  };


  // The same block keying over the unfiltered list, so a group header can
  // resolve members the rail is currently hiding.
  const allBlocks = every === devices ? blocks : buildDeviceBlocks(every);
  const allByBlockId = new Map<string, LightingDevice[]>(allBlocks.map(b => [blockKey(b), devicesOfBlock(b)]));

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
          nestGroups
          groupBlock={id => blockMap.get(id)?.kind === 'group'}
          holdsGroup={id => groupsIn(groups, id).length > 0}
          renderGroup={(groupId, a, children, isDropTarget) => {
            const group = groups.find(g => g.id === groupId);
            if (!group) return null;
            const held = (ids: readonly string[]): LightingDevice[] => ids.flatMap(id => id in arrangement.groupMembers
              ? held(arrangement.groupMembers[id])
              : devicesOfBlockId(id));
            const members = held(arrangement.groupMembers[groupId] ?? []);
            const groupOn = members.some(z => z.ledsOn);
            const groupControlled = members.some(z => z.controlled !== false);
            // Counted off the unfiltered list, so a group that is nothing but
            // Nexus-Control-off devices goes with them while one the user just
            // made stays as a drop target. Nested groups count with their parent.
            const allIn = (id: string): LightingDevice[] => [
              ...(groups.find(g => g.id === id)?.members ?? []).flatMap(b => allByBlockId.get(b) ?? []),
              ...groupsIn(groups, id).flatMap(g => allIn(g.id)),
            ];
            const groupAll = allIn(groupId);
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
                onSelectAll={selectAllFor(members)}
                {...headerStack(members.map(z => z.id), group.name)}
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
