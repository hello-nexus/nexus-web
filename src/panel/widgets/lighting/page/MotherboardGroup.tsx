import { Power, Ban } from 'lucide-react';
import { useTranslation } from '../../../../lib/i18n';
import { CollapsibleSection } from '../../../../components/common/CollapsibleSection/CollapsibleSection';
import { type SortableRowArgs } from '../../../../components/common/SortableList/SortableList';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import { DeviceNotice } from './DeviceNotice';
import styles from '../LightingPage.module.scss';

/**
 * Wraps a run of motherboard zone cards (one per ARGB header) under one
 * collapsible header showing the parent OpenRGB device name; clicking
 * it toggles the zone list. Expanded by default.
 *
 * The header's group power switch is "on" iff any child zone is on, and
 * clicking flips every zone to the opposite state. Same fade-on-hover +
 * persistent-when-off behaviour as the per-zone power button.
 */
export function MotherboardGroup({
  parentName,
  groupOn,
  onTogglePower,
  groupDriven,
  onToggleDriven,
  children,
  ariaLabel,
  collapsed,
  onToggleCollapsed,
  leftAction,
  powerDisabled,
  notice,
  drag,
}: {
  parentName: string;
  /** True iff at least one child zone has its LEDs on. Drives the icon state
   *  and the persistent-when-off visibility of the group power button. */
  groupOn: boolean;
  /** Flips every child zone to the opposite of {@link groupOn}. */
  onTogglePower: () => void;
  /** True iff at least one child zone is driven. Drives the icon state and
   *  the persistent-when-off visibility of the group driven button. */
  groupDriven: boolean;
  /** Sets every child zone's driven state to the opposite of {@link groupDriven}. */
  onToggleDriven: () => void;
  children: React.ReactNode;
  /** Toggle a11y label. Defaults to the motherboard wording; provider groups
   *  (Philips Hue, …) pass their own so this collapsible group reads correctly. */
  ariaLabel?: string;
  /** Collapse state, owned by the parent so it can be persisted across restarts. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Optional node rendered to the left of the power button in the header right slot. */
  leftAction?: React.ReactNode;
  /** When true, the power button is rendered disabled. */
  powerDisabled?: boolean;
  /** Optional advisory shown via an (i) right after the group title. */
  notice?: string;
  /** Optional reorder drag wiring; makes the whole group draggable. */
  drag?: SortableRowArgs;
}) {
  const { t } = useTranslation();
  const expanded = !collapsed;
  const toggleLabel = ariaLabel ?? t('lighting.devices.motherboardHeader');

  return (
    <CollapsibleSection
      compact
      className={styles.motherboardGroup}
      title={parentName}
      open={expanded}
      onToggle={onToggleCollapsed}
      ariaLabel={toggleLabel}
      titleAfter={notice != null ? <DeviceNotice notice={notice} /> : undefined}
      drag={drag}
      rightInteractive
      right={
        <>
          {leftAction}
          <HoverTooltip body={t(groupDriven ? 'lighting.devices.driven' : 'lighting.devices.notDriven')} side="top">
            <button
              type="button"
              role="switch"
              aria-checked={groupDriven}
              className={`${styles.deviceSettingsBtn} ${groupDriven ? '' : styles.devicePowerBtnPersistent}`}
              aria-label={t(groupDriven ? 'lighting.devices.driven' : 'lighting.devices.notDriven')}
              onClick={e => { e.stopPropagation(); onToggleDriven(); }}
            >
              <Ban />
            </button>
          </HoverTooltip>
          <HoverTooltip body={t(groupOn ? 'lighting.devices.powerOn' : 'lighting.devices.powerOff')} side="top">
            <button
              type="button"
              role="switch"
              aria-checked={groupOn}
              disabled={powerDisabled}
              className={`${styles.deviceSettingsBtn} ${groupOn ? '' : styles.devicePowerBtnPersistent}`}
              aria-label={t(groupOn ? 'lighting.devices.powerOn' : 'lighting.devices.powerOff')}
              onClick={e => { e.stopPropagation(); onTogglePower(); }}
            >
              <Power />
            </button>
          </HoverTooltip>
        </>
      }
    >
      <div className={styles.motherboardGroupChildren}>
        {children}
      </div>
    </CollapsibleSection>
  );
}
