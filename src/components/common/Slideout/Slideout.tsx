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
  /** Suppresses this slideout's own Esc handling - set while a modal stacked
   *  on top of it (e.g. a ConfirmModal) is open, so Overlay's independent
   *  per-instance Esc listeners don't both fire on one keypress and close
   *  the slideout out from under the modal in front of it. */
  noEscDismiss?: boolean;
  children: ReactNode;
}

/**
 * Right-anchored slide-in panel - the same visual treatment as the panel
 * editor's desktop add-widget drawer (PanelEditorSheet's
 * `.editorBackdrop[data-surface='desktop']` / `.editorSheet` in
 * panel/PanelApp.module.scss): a translucent scrim, a `--backdrop-base`
 * surface with a left border, sliding in from the right. Built on Overlay's
 * `sheet` variant so any dashboard surface can open the same slideout style
 * without depending on the panel editor's grid/theme state - that component
 * is a widget-grid editor first, not a general-purpose drawer, so this is a
 * standalone sibling that matches its look rather than reusing it directly.
 *
 * Esc and a backdrop click both close (Overlay's default dismiss behavior)
 * unless `noEscDismiss` is set.
 */
export function Slideout({ open, onClose, title, icon, headerRight, ariaLabel, noEscDismiss, children }: SlideoutProps) {
  const { t } = useTranslation();
  return (
    <Overlay
      open={open}
      onClose={onClose}
      variant="sheet"
      className={styles.sheet}
      backdropClassName={styles.backdrop}
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
