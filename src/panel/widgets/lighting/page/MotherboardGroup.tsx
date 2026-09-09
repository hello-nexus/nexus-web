import { useRef, useState } from 'react';
import { Power, PowerOff, Unlink, Link2, MoreVertical, Trash2 } from 'lucide-react';
import { useTranslation } from '../../../../lib/i18n';
import { CollapsibleSection } from '../../../../components/common/CollapsibleSection/CollapsibleSection';
import { type SortableRowArgs } from '../../../../components/common/SortableList/SortableList';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import { DeviceContextMenu, type DeviceMenuItem } from '../../../../components/common/DeviceCanvas/DeviceContextMenu';
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
  leftAction,
  hideLights,
  notice,
  drag,
  hideActions,
  onRename,
  onDelete,
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
  /** Optional node rendered to the left of the actions menu in the header right slot. */
  leftAction?: React.ReactNode;
  /** Omits the lights row - firmware owns the group's LEDs. */
  hideLights?: boolean;
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
}) {
  const { t } = useTranslation();
  const expanded = !collapsed;
  const toggleLabel = ariaLabel ?? t('lighting.devices.motherboardHeader');
  // seq remounts the menu on every open; see ZoneCard for the same pattern.
  const [menuAt, setMenuAt] = useState<{ x: number; y: number; seq: number } | null>(null);
  const menuSeq = useRef(0);

  const menuItems = (): DeviceMenuItem[] => {
    const items: DeviceMenuItem[] = [
      groupControlled
        ? { key: 'controlled', icon: <Unlink size={14} />, label: t('lighting.devices.menuControlOff'), onSelect: onToggleControlled }
        : { key: 'controlled', icon: <Link2 size={14} />, label: t('lighting.devices.menuControlOn'), onSelect: onToggleControlled },
    ];
    if (!hideLights) {
      items.push(groupOn
        ? { key: 'power', icon: <PowerOff size={14} />, label: t('lighting.devices.menuLightsOff'), onSelect: onTogglePower }
        : { key: 'power', icon: <Power size={14} />, label: t('lighting.devices.menuLightsOn'), onSelect: onTogglePower });
    }
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
        className={styles.motherboardGroup}
        title={parentName}
        open={expanded}
        onToggle={onToggleCollapsed}
        ariaLabel={toggleLabel}
        onTitleRename={onRename}
        titleAfter={notice != null ? <DeviceNotice notice={notice} /> : undefined}
        drag={drag}
        rightInteractive
        right={hideActions ? leftAction : (
          <>
            {leftAction}
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
