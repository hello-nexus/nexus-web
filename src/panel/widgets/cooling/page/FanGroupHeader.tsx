import { useRef, useState } from 'react';
import { Link, Lock, MousePointerClick, Pencil, RotateCcw, Trash2, Unlink, Unlock } from 'lucide-react';
import { useTranslation } from '../../../../lib/i18n';
import { pluralKey } from '../../../../lib/pluralKey';
import { CollapsibleSection } from '../../../../components/common/CollapsibleSection/CollapsibleSection';
import { type EditableTextHandle } from '../../../../components/common/Editable/EditableText';
import { DeviceContextMenu, type DeviceMenuItem } from '../../../../components/common/DeviceCanvas/DeviceContextMenu';
import { MenuArrowButton } from '../../../../components/common/DeviceCanvas/MenuArrowButton';
import { groupMenuItems, type GroupMove } from '../../../../components/common/DeviceCanvas/groupMenuItems';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import { type SortableRowArgs } from '../../../../components/common/SortableList/SortableList';
import styles from '../CoolingPage.module.scss';

/**
 * Header for a run of fan cards, hardware or user-made. Mirrors the lighting
 * rail's group header: collapse, an editable title, and one overflow menu whose
 * rows name the action they perform over every member at once. Delete appears
 * only on a user-made group; a hub's ports describe how the device is wired and
 * cannot be taken apart.
 */
export function FanGroupHeader({
  name, count, collapsed, onToggleCollapsed,
  groupControlled, onToggleControlled,
  groupLocked, onToggleLock,
  onRename, onDelete, onResetName, drag, dropTarget, children,
  hasUncontrolled = false,
  icon,
  onSelectAll,
  groupMove,
}: {
  name: string;
  count: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** True iff at least one member is controlled, so the menu offers to release the group. */
  groupControlled: boolean;
  onToggleControlled: () => void;
  /** True iff at least one member is locked, so the menu offers to unlock. */
  groupLocked: boolean;
  /** True iff at least one member has Nexus Control off, whether or not the eye
   *  is currently hiding it - the badge is how a hidden fan stays accounted for. */
  hasUncontrolled?: boolean;
  onToggleLock: () => void;
  onRename?: (name: string) => void;
  onDelete?: () => void;
  /** Present only on a renamed hardware or board group; puts the header back on
   *  the name the device reports, or the board model system specs give. A user
   *  group's name has nothing to fall back to. */
  onResetName?: () => void;
  drag?: SortableRowArgs;
  /** True while a dragged card would land in this group; washes the section so
   *  the destination is unambiguous before the drop. */
  dropTarget?: boolean;
  /** Glyph before the name; a hardware group's device, absent on a user group. */
  icon?: React.ReactNode;
  /** Selects every selectable member; the row counts them. Absent when none can be. */
  onSelectAll?: { count: number; run: () => void };
  /** Group placement for a hardware group's own row on the rail. */
  groupMove?: GroupMove;
  children: React.ReactNode;
}) {
  const { t, language } = useTranslation();
  // seq remounts the menu on every open; see ZoneCard for the same pattern.
  const [menuAt, setMenuAt] = useState<{ x: number; y: number; seq: number } | null>(null);
  const menuSeq = useRef(0);
  const nameRef = useRef<EditableTextHandle>(null);

  const menuItems = (): DeviceMenuItem[] => {
    // Nexus Control and Lock act over the members. An empty group has none, so
    // the rows would be inert; it lists only what it can actually do.
    const items: DeviceMenuItem[] = count === 0 ? [] : [
      groupControlled
        ? { key: 'controlled', icon: <Unlink size={14} />, label: t('cooling.fan.menuControlOff'), onSelect: onToggleControlled }
        : { key: 'controlled', icon: <Link size={14} />, label: t('cooling.fan.menuControlOn'), onSelect: onToggleControlled },
      groupLocked
        ? { key: 'lock', icon: <Unlock size={14} />, label: t('cooling.lock.unlock'), onSelect: onToggleLock }
        : { key: 'lock', icon: <Lock size={14} />, label: t('cooling.lock.lock'), onSelect: onToggleLock },
    ];
    if (onSelectAll) {
      items.unshift({
        key: 'selectAll', icon: <MousePointerClick size={14} />,
        label: t(pluralKey('cooling.fan.selectGroupCount', language, onSelectAll.count), { count: onSelectAll.count }),
        onSelect: onSelectAll.run, separatorAfter: true,
      });
    }
    if (onRename) {
      items.push({ key: 'rename', icon: <Pencil size={14} />, label: t('cooling.fan.rename'), onSelect: () => nameRef.current?.startEditing() });
    }
    if (onResetName) {
      items.push({ key: 'resetName', icon: <RotateCcw size={14} />, label: t('cooling.fan.resetName'), onSelect: onResetName });
    }
    items.push(...groupMenuItems(t, language, 'cooling.fan', groupMove));
    if (onDelete) {
      if (items.length > 0) items[items.length - 1].separatorAfter = true;
      items.push({ key: 'delete', icon: <Trash2 size={14} />, label: t('cooling.fan.groupDelete'), onSelect: onDelete });
    }
    return items;
  };

  return (
    <>
      <CollapsibleSection
        compact
        className={dropTarget ? styles.fanGroupDropTarget : undefined}
        title={name}
        titleBefore={icon}
        ariaLabel={name}
        open={!collapsed}
        onToggle={onToggleCollapsed}
        onTitleRename={onRename}
        titleRenameRef={nameRef}
        onHeaderContextMenu={e => {
          e.preventDefault();
          e.stopPropagation();
          setMenuAt({ x: e.clientX, y: e.clientY, seq: ++menuSeq.current });
        }}
        drag={drag}
        rightInteractive
        right={(
          <>
            {hasUncontrolled && (
              <HoverTooltip body={t('devices.hidden.groupHasUncontrolled')} side="top">
                <span className={styles.fanGroupUncontrolled} aria-label={t('devices.hidden.groupHasUncontrolled')}>
                  <Unlink size={11} aria-hidden />
                </span>
              </HoverTooltip>
            )}
            <span className={styles.fanGroupCount}>{count}</span>
            <MenuArrowButton
              variant="header"
              label={t('cooling.fan.groupActions', { name })}
              tooltip={t('cooling.fan.groupActions', { name })}
              open={menuAt != null}
              onOpen={(x, y) => setMenuAt({ x, y, seq: ++menuSeq.current })}
              onClose={() => setMenuAt(null)}
            />
          </>
        )}
      >
        {children}
      </CollapsibleSection>
      {menuAt && (
        <DeviceContextMenu
          key={menuAt.seq}
          x={menuAt.x}
          y={menuAt.y}
          items={menuItems()}
          onClose={() => setMenuAt(null)}
        />
      )}
    </>
  );
}
