import type { ReactNode } from 'react';
import styles from '../site.module.scss';

/**
 * Card shell for the "cropped-in" live demos: the children are the app's real
 * components running on sample data. `interactive: false` disables pointer
 * events and hides the subtree from the accessibility tree (the demo is
 * purely decorative motion).
 */
export function DemoFrame({ children, interactive = true, className }: {
  children: ReactNode;
  interactive?: boolean;
  className?: string;
}) {
  return (
    <div className={`${styles.demoFrame} ${className ?? ''}`}>
      <div
        className={interactive ? styles.demoBody : `${styles.demoBody} ${styles.demoStatic}`}
        aria-hidden={!interactive}
      >
        {children}
      </div>
    </div>
  );
}
