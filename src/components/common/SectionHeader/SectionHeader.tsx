import type { CSSProperties, ReactNode } from 'react';
import styles from './SectionHeader.module.scss';

/**
 * Canonical settings section header: a muted body-type label. Usually rendered
 * by SettingsSection, which sits it above a surface box; spacing + alignment
 * are owned by the parent. The one header every settings section uses (panel
 * editor sheet, widget settings panes, device Settings tab) so they read
 * identically.
 *
 * The colour falls back to the app global (`--text-dim`) so it renders
 * correctly both inside `.panel-root` (the kiosk, where the `--panel-*` aliases
 * are defined) and outside it (the desktop dashboard, where they are not).
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
