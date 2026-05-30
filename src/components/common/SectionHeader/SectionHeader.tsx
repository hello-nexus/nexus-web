import type { CSSProperties, ReactNode } from 'react';
import styles from './SectionHeader.module.scss';

/**
 * Canonical settings section header: an uppercase label with a full-width
 * rule underneath. This is the ONE header every settings section should use
 * (panel editor sheet, widget settings panes, device Settings tab) so they
 * read identically. Replaces the per-pane bespoke header styles that drifted
 * apart (`.themeSectionTitle`, `.sectionTitle`, host-name `.title`, the dock
 * title, and the former global `.device-modal-section`, all now removed).
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
