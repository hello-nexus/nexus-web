import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import styles from './CanvasNoticeBar.module.scss';

interface CanvasNoticeBarProps {
  visible: boolean;
  message: string;
  icon?: ReactNode;
}

export function CanvasNoticeBar({ visible, message, icon }: CanvasNoticeBarProps) {
  if (!visible) return null;
  return (
    <div className={styles.bar} role="status" aria-live="polite">
      <span className={styles.icon}>{icon ?? <AlertTriangle size={12} />}</span>
      <span className={styles.message}>{message}</span>
    </div>
  );
}
