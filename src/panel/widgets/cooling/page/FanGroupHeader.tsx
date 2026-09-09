import { useRef, useState } from 'react';
import { Link2, Lock, MoreVertical, RotateCcw, Trash2, Unlink, Unlock } from 'lucide-react';
import { useTranslation } from '../../../../lib/i18n';
import { CollapsibleSection } from '../../../../components/common/CollapsibleSection/CollapsibleSection';
import { DeviceContextMenu, type DeviceMenuItem } from '../../../../components/common/DeviceCanvas/DeviceContextMenu';
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
  onToggleLock: () => void;
  onRename?: (name: string) => void;
  onDelete?: () => void;
  /** Present only on a renamed HARDWARE group; puts the header back on the name
   *  the device reports. A user group's name has nothing to fall back to. */
  onResetName?: () => void;
  drag?: SortableRowArgs;
  /** True while a dragged card would land in this group; rings the header so the
   *  destination is unambiguous before the drop. */
  dropTarget?: boolean;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  // seq remounts the menu on every open; see ZoneCard for the same pattern.
  const [menuAt, setMenuAt] = useState<{ x: number; y: number; seq: number } | null>(null);
  const menuSeq = useRef(0);

  const menuItems = (): DeviceMenuItem[] => {
    const items: DeviceMenuItem[] = [
      groupControlled
        ? { key: 'controlled', icon: <Unlink size={14} />, label: t('cooling.fan.menuControlOff'), onSelect: onToggleControlled }
        : { key: 'controlled', icon: <Link2 size={14} />, label: t('cooling.fan.menuControlOn'), onSelect: onToggleControlled },
      groupLocked
        ? { key: 'lock', icon: <Unlock size={14} />, label: t('cooling.lock.unlock'), onSelect: onToggleLock }
        : { key: 'lock', icon: <Lock size={14} />, label: t('cooling.lock.lock'), onSelect: onToggleLock },
    ];
    if (onResetName) {
      items.push({ key: 'resetName', icon: <RotateCcw size={14} />, label: t('cooling.fan.resetName'), onSelect: onResetName });
    }
    if (onDelete) {
      items[items.length - 1].separatorAfter = true;
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
        ariaLabel={name}
        open={!collapsed}
        onToggle={onToggleCollapsed}
        onTitleRename={onRename}
        drag={drag}
        rightInteractive
        right={(
          <>
            <span className={styles.fanGroupCount}>{count}</span>
            <HoverTooltip body={t('cooling.fan.groupActions', { name })} side="top">
              <button
                type="button"
                className={styles.fanGroupMenuBtn}
                aria-label={t('cooling.fan.groupActions', { name })}
                data-no-dnd
                onClick={e => {
                  e.stopPropagation();
                  if (menuAt) { setMenuAt(null); return; }
                  const r = e.currentTarget.getBoundingClientRect();
                  setMenuAt({ x: r.right, y: r.bottom + 4, seq: ++menuSeq.current });
                }}
              >
                <MoreVertical size={14} />
              </button>
            </HoverTooltip>
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
