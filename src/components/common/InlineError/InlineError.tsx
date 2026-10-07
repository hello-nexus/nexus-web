import type { ReactNode } from 'react';
import styles from './InlineError.module.scss';

/** A failure message beside or under a control, in the error colour. For a boxed warning use Notice. */
export function InlineError({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={`${styles.error} ${className ?? ''}`} role="alert">{children}</span>;
}
