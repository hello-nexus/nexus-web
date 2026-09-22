import { useRef, useState } from 'react';
import { Power, PowerOff, Unlink, Link, MoreVertical, MousePointerClick, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { useTranslation } from '../../../../lib/i18n';
import { pluralKey } from '../../../../lib/pluralKey';
import { CollapsibleSection } from '../../../../components/common/CollapsibleSection/CollapsibleSection';
import { type EditableTextHandle } from '../../../../components/common/Editable/EditableText';
import { type SortableRowArgs } from '../../../../components/common/SortableList/SortableList';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import { DeviceContextMenu, type DeviceMenuItem } from '../../../../components/common/DeviceCanvas/DeviceContextMenu';
import { groupMenuItems, stackMenuItems, type GroupMove } from '../../../../components/common/DeviceCanvas/groupMenuItems';
import { DeviceNotice } from './DeviceNotice';
import styles from '../LightingPage.module.scss';

/**
 * Wraps a run of motherboard zone cards (one per ARGB header) under one
 * collapsible header showing the parent OpenRGB device name; clicking
 * it toggles the zone list. Expanded by default.
 *
 * The header's actions menu mirrors the per-card one: each row names the
 * action it performs over every child zone at once, so "on" means at least
 * one zone is on and pressing it turns them all off.
 */
export function MotherboardGroup({
  parentName,
  groupOn,
  onTogglePower,
  groupControlled,
  onToggleControlled,
  children,
  ariaLabel,
  collapsed,
  onToggleCollapsed,
  notice,
  drag,
  hideActions,
  onRename,
  onDelete,
  onResetName,
  dropTarget,
  empty,
  count,
  hasUncontrolled = false,
  icon,
  onSelectAll,
  groupMove,
  stack,
  unstack,
}: {
  parentName: string;
  /** True iff at least one child zone has its LEDs on, so the menu offers to
   *  turn the group off. */
  groupOn: boolean;
  /** Flips every child zone to the opposite of {@link groupOn}. */
  onTogglePower: () => void;
  /** True iff at least one child zone is controlled, so the menu offers to
   *  release the group. */
  groupControlled: boolean;
  /** Sets every child zone's controlled state to the opposite of {@link groupControlled}. */
  onToggleControlled: () => void;
  children: React.ReactNode;
  /** Toggle a11y label. Defaults to the motherboard wording; provider groups
   *  (Philips Hue, …) pass their own so this collapsible group reads correctly. */
  ariaLabel?: string;
  /** Collapse state, owned by the parent so it can be persisted across restarts. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Optional advisory shown via an (i) right after the group title. */
  notice?: string;
  /** Optional reorder drag wiring; makes the whole group draggable. */
  drag?: SortableRowArgs;
  /** Header collapses only - no actions menu. The immersive picker groups
   *  cards for selection; power and Nexus Control belong to the page. */
  hideActions?: boolean;
  /** Commits a new header name. Omitted where the group names no device (a
   *  smart-light brand) or where the surface only picks cards. */
  onRename?: (name: string) => void;
  /** Dissolves the group, returning its cards to the rail. Present only on
   *  user-made groups: a hardware group describes how the device is wired and
   *  cannot be taken apart. */
  onDelete?: () => void;
  /** Present only on a renamed HARDWARE group; puts the header back on the name
   *  the device reports. A user group's name has nothing to fall back to. */
  onResetName?: () => void;
  /** True while a dragged card would land in this group; washes the section so
   *  the destination is unambiguous before the drop. */
  dropTarget?: boolean;
  /** A user group nobody has dragged a card into yet. Its state rows would act
   *  over nothing, so the menu drops them. */
  empty?: boolean;
  /** Members currently listed under this group, shown on the far right. */
  count?: number;
  /** True iff at least one member has Nexus Control off, whether or not the eye
   *  is hiding it - the badge is how a hidden device stays accounted for. */
  hasUncontrolled?: boolean;
  /** Glyph before the name; a hardware group's device, absent on a user group. */
  icon?: React.ReactNode;
  /** Selects every selectable member; the row counts them. Absent when none can be. */
  onSelectAll?: { count: number; run: () => void };
  /** Group placement for a hardware group's own row on the rail. */
  groupMove?: GroupMove;
  /** Stacks every member to one frame; the row counts them. Absent with fewer than two. */
  stack?: { count: number; run: () => void };
  /** Takes the members apart; present when they are exactly one stack. */
  unstack?: () => void;
}) {
  const { t, language } = useTranslation();
  const expanded = !collapsed;
  const toggleLabel = ariaLabel ?? t('lighting.devices.motherboardHeader');
  // seq remounts the menu on every open; see ZoneCard for the same pattern.
  const [menuAt, setMenuAt] = useState<{ x: number; y: number; seq: number } | null>(null);
  const menuSeq = useRef(0);
  const nameRef = useRef<EditableTextHandle>(null);

  const menuItems = (): DeviceMenuItem[] => {
    const items: DeviceMenuItem[] = [];
    if (onSelectAll) {
      items.push({
        key: 'selectAll', icon: <MousePointerClick size={14} />,
        label: t(pluralKey('lighting.devices.selectGroupCount', language, onSelectAll.count), { count: onSelectAll.count }),
        onSelect: onSelectAll.run, separatorAfter: true,
      });
    }
    if (!empty) {
      items.push(groupOn
        ? { key: 'power', icon: <PowerOff size={14} />, label: t('lighting.devices.menuLightsOff'), onSelect: onTogglePower }
        : { key: 'power', icon: <Power size={14} />, label: t('lighting.devices.menuLightsOn'), onSelect: onTogglePower });
    }
    if (!empty) {
      items.push(groupControlled
        ? { key: 'controlled', icon: <Unlink size={14} />, label: t('lighting.devices.menuControlOff'), onSelect: onToggleControlled }
        : { key: 'controlled', icon: <Link size={14} />, label: t('lighting.devices.menuControlOn'), onSelect: onToggleControlled });
    }
    if (onRename) {
      items.push({ key: 'rename', icon: <Pencil size={14} />, label: t('lighting.devices.rename'), onSelect: () => nameRef.current?.startEditing() });
    }
    if (onResetName) {
      items.push({ key: 'resetName', icon: <RotateCcw size={14} />, label: t('lighting.devices.resetName'), onSelect: onResetName });
    }
    items.push(...groupMenuItems(t, language, 'lighting.devices', groupMove));
    items.push(...stackMenuItems(t, language, { stack: stack?.run, unstack }, stack?.count ?? 0));
    if (onDelete) {
      if (items.length > 0) items[items.length - 1].separatorAfter = true;
      items.push({ key: 'delete', icon: <Trash2 size={14} />, label: t('lighting.devices.groupDelete'), onSelect: onDelete });
    }
    return items;
  };

  return (
    <>
      <CollapsibleSection
        compact
        className={`${styles.motherboardGroup}${dropTarget ? ` ${styles.groupDropTarget}` : ''}`}
        title={parentName}
        titleBefore={icon}
        open={expanded}
        onToggle={onToggleCollapsed}
        ariaLabel={toggleLabel}
        onTitleRename={onRename}
        titleRenameRef={nameRef}
        onHeaderContextMenu={hideActions ? undefined : e => {
          e.preventDefault();
          e.stopPropagation();
          setMenuAt({ x: e.clientX, y: e.clientY, seq: ++menuSeq.current });
        }}
        titleAfter={notice != null ? <DeviceNotice notice={notice} /> : undefined}
        drag={drag}
        rightInteractive
        right={hideActions ? undefined : (
          <>
            {hasUncontrolled && (
              <HoverTooltip body={t('devices.hidden.groupHasUncontrolled')} side="top">
                <span className={styles.deviceGroupUncontrolled} aria-label={t('devices.hidden.groupHasUncontrolled')}>
                  <Unlink size={11} aria-hidden />
                </span>
              </HoverTooltip>
            )}
            {count !== undefined && <span className={styles.deviceGroupCount}>{count}</span>}
            <HoverTooltip body={t('lighting.devices.moreActions')} side="top">
              <button
                type="button"
                className={`${styles.deviceSettingsBtn} ${styles.deviceMenuBtn}`}
                aria-label={t('lighting.devices.groupActions', { name: parentName })}
                onClick={e => {
                  e.stopPropagation();
                  if (menuAt) { setMenuAt(null); return; }
                  const r = e.currentTarget.getBoundingClientRect();
                  setMenuAt({ x: r.right, y: r.bottom + 4, seq: ++menuSeq.current });
                }}
              >
                <MoreVertical />
              </button>
            </HoverTooltip>
          </>
        )}
      >
        <div className={styles.motherboardGroupChildren}>
          {children}
        </div>
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
