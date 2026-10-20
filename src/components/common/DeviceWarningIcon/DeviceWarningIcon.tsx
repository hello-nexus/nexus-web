import { AlertTriangle } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { Badge } from '../Badge/Badge';
import { WarningIcon } from '../WarningIcon/WarningIcon';
import styles from './DeviceWarningIcon.module.scss';

interface WarningCopy {
  message: string;
  /** Short chip label key. */
  chip?: string;
  /** App the chip names through the shared "{app} running" string; the same contention ConflictRunningBadge reports. */
  runningApp?: string;
}

// Service-reported device warning codes mapped to their localized copy. Any
// handler can flag an issue via DeviceListItem.warning without new UI - add the
// code here.
const WARNINGS: Record<string, WarningCopy> = {
  'access-denied': { message: 'devices.warning.accessDenied', chip: 'devices.warning.chip.accessDenied' },
  'bulk-pipe-unavailable': { message: 'devices.warning.bulkPipeUnavailable' },
  'usb-disconnected': { message: 'devices.warning.usbDisconnected', chip: 'devices.warning.chip.usbDisconnected' },
  'display-disconnected': { message: 'devices.warning.displayDisconnected', chip: 'devices.warning.chip.displayDisconnected' },
  'touch-permission': { message: 'devices.warning.touchPermission', chip: 'devices.warning.chip.touchPermission' },
  'elgato-software-running': { message: 'devices.warning.elgatoSoftwareRunning', runningApp: 'Elgato' },
};

/** Whether the warning is a running app's contention, which a running-conflict badge already names. */
export function isRunningAppWarning(code: string): boolean {
  return WARNINGS[code]?.runningApp !== undefined;
}

interface DeviceWarningIconProps {
  code: string;
  className?: string;
  /** A labelled pill (the Devices list) instead of the bare glyph (sidebar rows). */
  chip?: boolean;
}

/**
 * Device warning shown whenever `device.warning` is set: a right-aligned glyph,
 * or with `chip` a short labelled pill whose tooltip carries the full message.
 */
export function DeviceWarningIcon({ code, className, chip }: DeviceWarningIconProps) {
  const { t } = useTranslation();
  const copy = WARNINGS[code];
  const message = copy ? t(copy.message) : code;
  if (chip) {
    const label = copy?.chip ? t(copy.chip)
      : copy?.runningApp ? t('devices.conflictRunning.badge', { app: copy.runningApp })
        : t('devices.warning.chip.generic');
    return (
      <Badge
        label={label}
        color="var(--warn)"
        icon={<AlertTriangle size={12} aria-hidden />}
        tooltip={{ body: message }}
        className={className}
      />
    );
  }
  return <WarningIcon bare message={message} className={`${styles.icon} ${className ?? ''}`} />;
}
