import { Folder, FolderInput, FolderMinus, FolderPlus, LayersPlus } from 'lucide-react';
import { LayersMinus } from './layersMinusIcon';
import { pluralKey } from '../../../lib/pluralKey';
import type { Language } from '../../../lib/settings';
import { bulkMenuLabel } from './bulkMenuLabel';
import type { DeviceMenuItem } from './DeviceContextMenu';

/** Group placement for one rail row, driving its menu's "New group" row and
 *  "Move to group" flyout. */
export interface GroupMove {
  /** User groups the row can move into; the one it already sits in is left out. */
  targets: readonly { id: string; name: string }[];
  onMove: (groupId: string) => void;
  /** Present only while the row sits in a user group; the row names it. */
  onRemove?: { name: string; run: () => void };
  /** Wraps the row in a new group where it sits. Absent when the nesting
   *  limit or the group cap forbids. */
  onGroup?: () => void;
}

/**
 * The menu rows that place a row (or a whole selection) in a group, shared by
 * the lighting and cooling cards and group headers. `ns` picks the page's
 * strings. In bulk mode only "New group" is offered, over the selection.
 */
export function groupMenuItems(
  t: (key: string, params?: Record<string, string | number>) => string,
  language: Language,
  ns: 'lighting.devices' | 'cooling.fan',
  groupMove: GroupMove | undefined,
  bulk?: { count: number; group?: () => void },
): DeviceMenuItem[] {
  const items: DeviceMenuItem[] = [];
  const onGroup = bulk ? bulk.group : groupMove?.onGroup;
  if (onGroup) {
    items.push({
      key: 'group:new', icon: <FolderPlus size={14} />,
      label: bulkMenuLabel(t, language, bulk, `${ns}.moveToNewGroup`, `${ns}.moveToNewGroupCount`),
      onSelect: onGroup,
    });
  }
  if (bulk || !groupMove) return items;
  const rows: DeviceMenuItem[] = groupMove.targets.map(target => ({
    key: `group:${target.id}`, icon: <Folder size={14} />, label: target.name,
    onSelect: () => groupMove.onMove(target.id),
  }));
  if (groupMove.onRemove) {
    if (rows.length > 0) rows[rows.length - 1].separatorAfter = true;
    rows.push({
      key: 'group:none', icon: <FolderMinus size={14} />,
      label: t(`${ns}.removeFromGroup`, { name: groupMove.onRemove.name }),
      onSelect: groupMove.onRemove.run,
    });
  }
  if (rows.length > 0) {
    items.push({ key: 'moveToGroup', icon: <FolderInput size={14} />, label: t(`${ns}.moveToGroup`), submenu: rows });
  }
  return items;
}

/** Stack placement for a row or a selection: stack them as one, or take them apart. */
export interface StackActions {
  stack?: () => void;
  unstack?: () => void;
}

/**
 * The menu rows that stack cards to one frame, shared by the lighting cards and
 * headers. `count` is how many cards the stack row would take; the unstack row
 * never counts, it acts on the stack the row sits in.
 */
export function stackMenuItems(
  t: (key: string, params?: Record<string, string | number>) => string,
  language: Language,
  actions: StackActions | undefined,
  count: number,
): DeviceMenuItem[] {
  const items: DeviceMenuItem[] = [];
  if (actions?.stack) {
    items.push({
      key: 'stack', icon: <LayersPlus size={14} />,
      label: t(pluralKey('lighting.devices.stackCount', language, count), { count }),
      onSelect: actions.stack,
    });
  }
  if (actions?.unstack) {
    items.push({ key: 'unstack', icon: <LayersMinus size={14} />, label: t('lighting.devices.unstack'), onSelect: actions.unstack });
  }
  return items;
}
