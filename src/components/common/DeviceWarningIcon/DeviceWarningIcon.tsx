import { AlertTriangle } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import styles from './DeviceWarningIcon.module.scss';

// Service-reported device warning codes mapped to their localized message.
// Any handler can flag an issue via DeviceListItem.warning without new UI -
// add the code's i18n key here.
const WARNING_MESSAGE_KEYS: Record<string, string> = {
  'usb-disconnected': 'devices.warning.usbDisconnected',
  'display-disconnected': 'devices.warning.displayDisconnected',
};

interface DeviceWarningIconProps {
  code: string;
  className?: string;
}

/**
 * Right-aligned warning glyph for a device row/card, shown whenever
 * `device.warning` is set. A bare (non-focusable) icon so it can sit inside
 * a device row/card that is itself a button, matching DeviceNotice's pattern.
 */
export function DeviceWarningIcon({ code, className }: DeviceWarningIconProps) {
  const { t } = useTranslation();
  const key = WARNING_MESSAGE_KEYS[code];
  const message = key ? t(key) : code;
  return (
    <HoverTooltip body={message} side="top">
      <span className={`${styles.icon} ${className ?? ''}`} role="img" aria-label={message}>
        <AlertTriangle size={14} aria-hidden />
      </span>
    </HoverTooltip>
  );
}
