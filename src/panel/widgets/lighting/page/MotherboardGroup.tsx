import { Power } from 'lucide-react';
import { useTranslation } from '../../../../lib/i18n';
import { CollapsibleSection } from '../../../../components/common/CollapsibleSection/CollapsibleSection';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
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
  children,
  ariaLabel,
  collapsed,
  onToggleCollapsed,
}: {
  parentName: string;
  /** True iff at least one child zone has its LEDs on. Drives the icon state
   *  and the persistent-when-off visibility of the group power button. */
  groupOn: boolean;
  /** Flips every child zone to the opposite of {@link groupOn}. */
  onTogglePower: () => void;
  children: React.ReactNode;
  /** Toggle a11y label. Defaults to the motherboard wording; provider groups
   *  (Philips Hue, …) pass their own so this collapsible group reads correctly. */
  ariaLabel?: string;
  /** Collapse state, owned by the parent so it can be persisted across restarts. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
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
      right={
        <HoverTooltip body={t(groupOn ? 'lighting.devices.powerOn' : 'lighting.devices.powerOff')} side="top">
          <button
            type="button"
            role="switch"
            aria-checked={groupOn}
            className={`${styles.deviceSettingsBtn} ${groupOn ? '' : styles.devicePowerBtnPersistent}`}
            aria-label={t(groupOn ? 'lighting.devices.powerOn' : 'lighting.devices.powerOff')}
            onClick={e => { e.stopPropagation(); onTogglePower(); }}
          >
            <Power />
          </button>
        </HoverTooltip>
      }
    >
      <div className={styles.motherboardGroupChildren}>
        {children}
      </div>
    </CollapsibleSection>
  );
}
