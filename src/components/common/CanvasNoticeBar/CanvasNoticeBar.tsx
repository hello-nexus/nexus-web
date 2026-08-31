import type { ReactNode } from 'react';
import { AlertTriangle, Hourglass } from 'lucide-react';
import { Button } from '../Button/Button';
import styles from './CanvasNoticeBar.module.scss';

interface CanvasNoticeBarProps {
  visible: boolean;
  message: string;
  icon?: ReactNode;
  /** `wait` reads as in-progress; `fault` is the amber alert styling. */
  tone?: 'wait' | 'fault';
  /** Only this button takes pointer events; the bar stays click-through. */
  action?: { label: string; onClick: () => void };
}

export function CanvasNoticeBar({ visible, message, icon, tone = 'fault', action }: CanvasNoticeBarProps) {
  if (!visible) return null;
  return (
    <div className={styles.bar} role="status" aria-live="polite">
      <span className={tone === 'wait' ? styles.iconWait : styles.icon}>
        {icon ?? (tone === 'wait' ? <Hourglass size={12} /> : <AlertTriangle size={12} />)}
      </span>
      <span className={styles.message}>{message}</span>
      {action && (
        <Button tone="ghost" size="sm" className={styles.action} onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
