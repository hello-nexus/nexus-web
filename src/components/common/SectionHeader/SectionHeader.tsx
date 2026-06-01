import type { CSSProperties, ReactNode } from 'react';
import styles from './SectionHeader.module.scss';

/**
 * Canonical settings section header: an uppercase label with a full-width
 * rule underneath. The one header every settings section uses (panel editor
 * sheet, widget settings panes, device Settings tab) so they read identically.
 *
 * Tokens fall back to the app globals (`--text-dim` / `--border`) so it
 * renders correctly both inside `.panel-root` (the kiosk, where the
 * `--panel-*` aliases are defined) and outside it (the desktop dashboard
 * device-Settings tab, where they are not).
 */
export function SectionHeader({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={className ? `${styles.sectionHeader} ${className}` : styles.sectionHeader}
      style={style}
    >
      {children}
    </div>
  );
}
