import { FlaskConical } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { Badge } from '../Badge/Badge';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import styles from './ExperimentalBadge.module.scss';

/**
 * Pill badge flagging a device whose support is experimental - non-HYTE/iBUYPOWER
 * hardware Nexus drives on a best-effort basis. Hover/pointer reveals a tooltip
 * spelling out the caveat. Rendered left of the Nexus Link control on the Devices
 * list and under the on/off switch on the device page.
 */
export function ExperimentalBadge({ className }: { className?: string }) {
  const { t } = useTranslation();
  const title = t('devices.experimental.tooltip.title');
  const body = t('devices.experimental.tooltip.body');
  return (
    <HoverTooltip title={title} body={body} side="top">
      {/* role/aria-label expose the caveat to AT, since the hover tooltip alone
          is pointer-only (matching DeviceWarningIcon's bare-span pattern). */}
      <span className={`${styles.trigger} ${className ?? ''}`} role="img" aria-label={`${title}. ${body}`}>
        <Badge
          label={t('devices.experimental.badge')}
          color="var(--warn)"
          icon={<FlaskConical size={12} aria-hidden />}
        />
      </span>
    </HoverTooltip>
  );
}
