import { useState } from 'react';
import { ChevronDown, ChevronRight, Power } from 'lucide-react';
import { useTranslation } from '../../../../lib/i18n';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import styles from '../LightingPage.module.scss';

/**
 * Wraps a run of motherboard zone cards (one per ARGB header) under a single
 * collapsible header so the device list doesn't get visually overwhelmed when
 * a board has three or four headers. Header shows the parent OpenRGB device
 * name; clicking it toggles the zone list. Expanded by default.
 *
 * The header also carries a group power switch: it's "on" iff any child zone
 * is on, and clicking flips every zone to the opposite state. Same fade-on-
 * hover + persistent-when-off behaviour as the per-zone power button so the
 * group surface visually parrots its children.
 */
export function MotherboardGroup({
  parentName,
  groupOn,
  onTogglePower,
  children,
}: {
  parentName: string;
  /** True iff at least one child zone has its LEDs on. Drives the icon state
   *  and the persistent-when-off visibility of the group power button. */
  groupOn: boolean;
  /** Flips every child zone to the opposite of {@link groupOn}. */
  onTogglePower: () => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);

  return (
    <div className={styles.motherboardGroup}>
      <div className={styles.motherboardGroupHeader}>
        <button
          type="button"
          className={styles.motherboardGroupToggle}
          onClick={() => setExpanded(v => !v)}
          aria-expanded={expanded}
          aria-label={t('lighting.devices.motherboardHeader')}
        >
          {expanded ? <ChevronDown /> : <ChevronRight />}
          <span className={styles.motherboardGroupName}>{parentName}</span>
        </button>
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
      </div>
      {expanded && (
        <div className={styles.motherboardGroupChildren}>
          {children}
        </div>
      )}
    </div>
  );
}
