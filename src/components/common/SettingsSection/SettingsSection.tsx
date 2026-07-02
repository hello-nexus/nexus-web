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
 * SectionHeader uses `--text-dim` and the box surface uses `--surface`.
 */
export function SettingsSection({
  title,
  description,
  titleStyle,
  action,
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
  // Optional trailing control next to the title (e.g. a section-wide "Sync
  // now" button), aligned on the same row.
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  boxClassName?: string;
  ariaLabel?: string;
}) {
  return (
    <section className={className ? `${styles.section} ${className}` : styles.section} aria-label={ariaLabel}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <SectionHeader style={titleStyle}>{title}</SectionHeader>
          {action !== undefined && <div className={styles.action}>{action}</div>}
        </div>
        {description !== undefined && <div className={styles.description}>{description}</div>}
      </div>
      <div className={boxClassName ? `${styles.box} ${boxClassName}` : styles.box}>
        {children}
      </div>
    </section>
  );
}
