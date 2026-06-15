import type { ReactNode } from 'react';
import { SectionHeader } from '../../../components/common/SectionHeader/SectionHeader';
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
      <SectionHeader>{title}</SectionHeader>
      <div className={styles.buttons}>{children}</div>
    </div>
  );
}
