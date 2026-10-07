import { useTranslation } from '../../../lib/i18n';
import { WarningIcon } from '../WarningIcon/WarningIcon';
import styles from './DeviceWarningIcon.module.scss';

// Service-reported device warning codes mapped to their localized message.
// Any handler can flag an issue via DeviceListItem.warning without new UI -
// add the code's i18n key here.
const WARNING_MESSAGE_KEYS: Record<string, string> = {
  'usb-disconnected': 'devices.warning.usbDisconnected',
  'display-disconnected': 'devices.warning.displayDisconnected',
  'touch-permission': 'devices.warning.touchPermission',
};

interface DeviceWarningIconProps {
  code: string;
  className?: string;
}

/**
 * Right-aligned warning glyph for a device row/card, shown whenever
 * `device.warning` is set, pushed to the row's right edge.
 */
export function DeviceWarningIcon({ code, className }: DeviceWarningIconProps) {
  const { t } = useTranslation();
  const key = WARNING_MESSAGE_KEYS[code];
  const message = key ? t(key) : code;
  return <WarningIcon message={message} className={`${styles.icon} ${className ?? ''}`} />;
}
