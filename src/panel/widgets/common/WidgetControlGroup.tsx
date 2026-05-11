import type { ReactNode } from 'react';
import styles from './WidgetControlGroup.module.scss';

export function WidgetControlGroup({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`${styles.group} ${className ?? ''}`}>
      <div className={styles.title}>{title}</div>
      <div className={styles.buttons}>{children}</div>
    </div>
  );
}
