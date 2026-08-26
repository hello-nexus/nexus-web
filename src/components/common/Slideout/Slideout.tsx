import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { Overlay } from '../Overlay/Overlay';
import styles from './Slideout.module.scss';

export interface SlideoutProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  icon?: ReactNode;
  headerRight?: ReactNode;
  /** Falls back to the app-wide close label when the title isn't plain text. */
  ariaLabel?: string;
  /** Suppresses this slideout's own Esc handling for a genuinely
   *  non-dismissable state. A modal stacked on top of it (e.g. a
   *  ConfirmModal) does not need this: the shared modal stack already
   *  arbitrates Escape to the topmost entry only. */
  noEscDismiss?: boolean;
  /** Edge the sheet docks to and slides in from. Defaults to the right. */
  side?: 'right' | 'left';
  /** Extra class on the sheet surface. Size and inner padding are read from
   *  the `--slideout-width` / `--slideout-header-padding` /
   *  `--slideout-body-padding` / `--slideout-body-gap` custom properties, so a
   *  consumer class sets those rather than fighting `.sheet` on specificity. */
  className?: string;
  children: ReactNode;
}

/**
 * Edge-anchored slide-in panel - right by default, `side="left"` docks and
 * slides it from the left instead. Same visual treatment as the panel
 * editor's desktop add-widget drawer (PanelEditorSheet's
 * `.editorBackdrop[data-surface='desktop']` / `.editorSheet` in
 * panel/PanelApp.module.scss): a translucent scrim, a `--backdrop-base`
 * surface with a border on the docked edge. Built on Overlay's
 * `sheet` variant so any dashboard surface can open the same slideout style
 * without depending on the panel editor's grid/theme state - that component
 * is a widget-grid editor first, not a general-purpose drawer, so this is a
 * standalone sibling that matches its look rather than reusing it directly.
 *
 * Esc and a backdrop click both close (Overlay's default dismiss behavior)
 * unless `noEscDismiss` is set.
 */
export function Slideout({
  open, onClose, title, icon, headerRight, ariaLabel, noEscDismiss,
  side = 'right', className, children,
}: SlideoutProps) {
  const { t } = useTranslation();
  return (
    <Overlay
      open={open}
      onClose={onClose}
      variant="sheet"
      className={[styles.sheet, side === 'left' ? styles.sheetLeft : '', className ?? ''].filter(Boolean).join(' ')}
      backdropClassName={[styles.backdrop, side === 'left' ? styles.backdropLeft : ''].filter(Boolean).join(' ')}
      ariaLabel={ariaLabel ?? (typeof title === 'string' ? title : undefined)}
      noEscDismiss={noEscDismiss}
    >
      <div className={styles.header}>
        <div className={styles.titleRow}>
          {icon && <span className={styles.icon}>{icon}</span>}
          <div className={styles.title}>{title}</div>
        </div>
        <div className={styles.headerRight}>
          {headerRight}
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label={t('app.window.close')}>
            <X size={18} />
          </button>
        </div>
      </div>
      <div className={styles.body}>{children}</div>
    </Overlay>
  );
}
