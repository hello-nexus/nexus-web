import styles from './WidgetHeader.module.scss';

interface WidgetHeaderProps {
  title: string;
  subtitle?: string;
}

export function WidgetHeader({ title, subtitle }: WidgetHeaderProps) {
  return (
    <header className={styles.header}>
      <span className={styles.title}>{title}</span>
      {subtitle ? <span className={styles.subtitle}>{subtitle}</span> : null}
    </header>
  );
}
