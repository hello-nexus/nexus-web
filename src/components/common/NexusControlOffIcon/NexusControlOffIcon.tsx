import { Unlink } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import styles from './NexusControlOffIcon.module.scss';

/**
 * Right-aligned glyph on a device row when Nexus Control is off for that device.
 * A bare (non-focusable) icon so it can sit inside a row that is itself a button.
 */
export function NexusControlOffIcon({ className, label: labelOverride }: { className?: string; label?: string }) {
  const { t } = useTranslation();
  const label = labelOverride ?? t('devices.nexusControlOff.sidebarTooltip');
  return (
    <HoverTooltip body={label} side="top">
      <span className={`${styles.icon} ${className ?? ''}`} role="img" aria-label={label}>
        <Unlink size={14} aria-hidden />
      </span>
    </HoverTooltip>
  );
}
