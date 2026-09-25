import { HoverTooltip } from '../components/common/HoverTooltip/HoverTooltip';
import { useTranslation } from '../lib/i18n';
import { NEXUS_WINDOW_ACTIONS, postWindowAction } from './windowActions';
import { useWindowMaximized } from './useWindowMaximized';
import styles from './CaptionButtons.module.scss';

// SVG glyphs sized to a 10x10 viewBox, centered inside each 46x32 button.
// Strokes mirror the Win11 caption-button line weight (1px in physical
// pixels at 100% DPI; the SVG strokes scale automatically with the host
// transform when the WebView2 device-pixel ratio changes).
const Minimize = () => (
  <svg viewBox="0 0 10 10" aria-hidden focusable="false">
    <path d="M0 5 H10" stroke="currentColor" strokeWidth="1" fill="none" />
  </svg>
);

const Maximize = () => (
  <svg viewBox="0 0 10 10" aria-hidden focusable="false">
    <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1" fill="none" />
  </svg>
);

const Restore = () => (
  <svg viewBox="0 0 10 10" aria-hidden focusable="false">
    {/* Win11 restore glyph: two overlapping 7x7 squares (back-bottom-left +
        forward-top-right) reading as stacked windows. */}
    <rect x="2.5" y="0.5" width="7" height="7" stroke="currentColor" strokeWidth="1" fill="none" />
    <rect x="0.5" y="2.5" width="7" height="7" stroke="currentColor" strokeWidth="1" fill="none" />
  </svg>
);

const Close = () => (
  <svg viewBox="0 0 10 10" aria-hidden focusable="false">
    <path d="M0 0 L10 10 M0 10 L10 0" stroke="currentColor" strokeWidth="1" fill="none" />
  </svg>
);

export function CaptionButtons() {
  const { t } = useTranslation();
  // The maximize <-> restore icon swap tracks the window's zoomed state.
  const maximized = useWindowMaximized();

  const maxLabel = maximized ? t('app.window.restore') : t('app.window.maximize');
  return (
    <div className={styles.bar} aria-label={t('app.window.controls')}>
      <HoverTooltip body={t('app.window.minimize')} side="bottom">
        <button
          type="button"
          className={styles.btn}
          onClick={() => postWindowAction(NEXUS_WINDOW_ACTIONS.minimize)}
          aria-label={t('app.window.minimize')}
        >
          <Minimize />
        </button>
      </HoverTooltip>
      <HoverTooltip body={maxLabel} side="bottom">
        <button
          type="button"
          className={styles.btn}
          onClick={() => postWindowAction(NEXUS_WINDOW_ACTIONS.toggleMaximize)}
          aria-label={maxLabel}
        >
          {maximized ? <Restore /> : <Maximize />}
        </button>
      </HoverTooltip>
      <HoverTooltip body={t('app.window.close')} side="bottom">
        <button
          type="button"
          className={`${styles.btn} ${styles.close}`}
          onClick={() => postWindowAction(NEXUS_WINDOW_ACTIONS.close)}
          aria-label={t('app.window.close')}
        >
          <Close />
        </button>
      </HoverTooltip>
    </div>
  );
}
