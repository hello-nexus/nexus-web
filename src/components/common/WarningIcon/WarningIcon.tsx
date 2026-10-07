import { AlertTriangle } from 'lucide-react';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import styles from './WarningIcon.module.scss';

interface WarningIconProps {
  /** What is wrong; shown on hover and read out as the icon's label. */
  message: string;
  /** `warning` is the default; `critical` is for what puts hardware at risk. */
  tone?: 'warning' | 'critical';
  className?: string;
}

/**
 * Warning triangle that explains itself on hover. A bare (non-focusable) icon
 * so it can sit inside a card or button, matching DeviceNotice's pattern.
 */
export function WarningIcon({ message, tone = 'warning', className }: WarningIconProps) {
  return (
    <HoverTooltip body={message} side="top">
      <span className={`${styles.icon} ${styles[tone]} ${className ?? ''}`} role="img" aria-label={message}>
        <AlertTriangle size={14} aria-hidden />
      </span>
    </HoverTooltip>
  );
}
