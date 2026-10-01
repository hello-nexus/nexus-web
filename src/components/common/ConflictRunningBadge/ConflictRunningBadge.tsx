import { AlertTriangle } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { Badge } from '../Badge/Badge';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import styles from './ConflictRunningBadge.module.scss';

/** Pill badge naming a running third-party app that also drives this device; sits beside ExperimentalBadge on the Devices list. */
export function ConflictRunningBadge({ appName, className }: { appName: string; className?: string }) {
  const { t } = useTranslation();
  const title = t('devices.conflictRunning.tooltip.title', { app: appName });
  const body = t('devices.conflictRunning.tooltip.body', { app: appName });
  return (
    <HoverTooltip title={title} body={body} side="top">
      <span className={`${styles.trigger} ${className ?? ''}`} role="img" aria-label={`${title}. ${body}`}>
        <Badge
          label={t('devices.conflictRunning.badge', { app: appName })}
          color="var(--warn)"
          icon={<AlertTriangle size={12} aria-hidden />}
        />
      </span>
    </HoverTooltip>
  );
}
