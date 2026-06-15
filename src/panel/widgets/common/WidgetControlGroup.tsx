import type { ReactNode } from 'react';
import { SettingsSection } from '../../../components/common/SettingsSection/SettingsSection';
import styles from './WidgetControlGroup.module.scss';

// The widget Size / Layout / Slots picker renders as a standard SettingsSection
// card so it aligns with the widget's setting cards below it (same header indent
// + surface box) instead of reading as flush bare-header chrome.
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
    <SettingsSection title={title} className={className}>
      <div className={styles.buttons}>{children}</div>
    </SettingsSection>
  );
}
