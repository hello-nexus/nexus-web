import { Info } from 'lucide-react';
import styles from './SimpleModeNotice.module.scss';

export interface SimpleModeNoticeProps {
  /** Translated line explaining what the simple page cannot show or manage. */
  message: string;
}

/** Shown when the active configuration has no tile on the simple page, which
 *  would otherwise read as nothing running. */
export function SimpleModeNotice({ message }: SimpleModeNoticeProps) {
  return (
    <p className={styles.notice} role="status">
      <Info className={styles.icon} size={16} aria-hidden />
      <span>{message}</span>
    </p>
  );
}
