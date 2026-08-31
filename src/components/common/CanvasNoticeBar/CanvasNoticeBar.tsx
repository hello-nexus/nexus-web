import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../Button/Button';
import styles from './CanvasNoticeBar.module.scss';

interface CanvasNoticeBarProps {
  visible: boolean;
  message: string;
  icon?: ReactNode;
  /** Optional fix-it affordance. Only this button takes pointer events; the bar
   *  stays click-through. */
  action?: { label: string; onClick: () => void };
}

export function CanvasNoticeBar({ visible, message, icon, action }: CanvasNoticeBarProps) {
  if (!visible) return null;
  return (
    <div className={styles.bar} role="status" aria-live="polite">
      <span className={styles.icon}>{icon ?? <AlertTriangle size={12} />}</span>
      <span className={styles.message}>{message}</span>
      {action && (
        <Button type="button" tone="ghost" size="sm" className={styles.action} onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
