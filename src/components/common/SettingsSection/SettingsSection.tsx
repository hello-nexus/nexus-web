import type { CSSProperties, ReactNode } from 'react';
import { SectionHeader } from '../SectionHeader/SectionHeader';
import styles from './SettingsSection.module.scss';

/**
 * Canonical settings group: a muted body-type header sitting ABOVE a
 * surface-filled box that holds the section's controls. The one pattern every
 * settings surface uses (dashboard Settings, panel editor, widget settings,
 * device modal) so they read identically. Replaces the older
 * SectionHeader-with-underline-inside-a-card look.
 *
 * Renders correctly both in the dashboard and inside `.panel-root` (kiosk):
 * the header colour falls back through SectionHeader's `--panel-text-muted`
 * alias, and the box surface uses `--surface` (defined in both contexts).
 */
export function SettingsSection({
  title,
  description,
  titleStyle,
  children,
  className,
  boxClassName,
  ariaLabel,
}: {
  title: ReactNode;
  // Optional muted hint under the title (still outside the box).
  description?: ReactNode;
  // Per-section title colour override (e.g. the danger zone red).
  titleStyle?: CSSProperties;
  children: ReactNode;
  className?: string;
  boxClassName?: string;
  ariaLabel?: string;
}) {
  return (
    <section className={className ? `${styles.section} ${className}` : styles.section} aria-label={ariaLabel}>
      <div className={styles.header}>
        <SectionHeader style={titleStyle}>{title}</SectionHeader>
        {description !== undefined && <div className={styles.description}>{description}</div>}
      </div>
      <div className={boxClassName ? `${styles.box} ${boxClassName}` : styles.box}>
        {children}
      </div>
    </section>
  );
}
