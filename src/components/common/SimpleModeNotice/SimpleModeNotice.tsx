import { Info } from 'lucide-react';
import styles from './SimpleModeNotice.module.scss';

export interface SimpleModeNoticeProps {
  /** Translated line explaining what the simple page cannot show or manage. */
  message: string;
}

/** Accent-tinted info line: a simple-page state with no tile, standing help text under a list, or a temporary override of a setting. */
export function SimpleModeNotice({ message }: SimpleModeNoticeProps) {
  return (
    <p className={styles.notice} role="status">
      <Info className={styles.icon} size={16} aria-hidden />
      <span>{message}</span>
    </p>
  );
}
