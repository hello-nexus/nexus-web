import { useEffect, useState } from 'react';
import { HoverTooltip } from '../components/common/HoverTooltip/HoverTooltip';
import { useTranslation } from '../lib/i18n';
import { QOS_WINDOW_ACTIONS, postWindowAction } from './windowActions';
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
    {/* Win11 restore glyph: a 7x7 square in the back-bottom-left + a 7x7
        square offset forward-top-right. The "L" cut where the squares
        overlap is what visually reads as "stacked windows". */}
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
  // We don't get a WebView2-side maximize event, so we infer from the
  // outerHeight delta: a maximized window matches the screen working area
  // (no caption + no taskbar gap), within a 4px tolerance for DPI rounding.
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    const measure = () => {
      if (typeof window === 'undefined') return;
      const aw = window.screen.availWidth;
      const ah = window.screen.availHeight;
      const w = window.outerWidth;
      const h = window.outerHeight;
      setMaximized(Math.abs(w - aw) <= 4 && Math.abs(h - ah) <= 4);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const maxLabel = maximized ? t('app.window.restore') : t('app.window.maximize');
  return (
    <div className={styles.bar} aria-label="Window controls">
      <HoverTooltip body={t('app.window.minimize')} side="bottom">
        <button
          type="button"
          className={styles.btn}
          onClick={() => postWindowAction(QOS_WINDOW_ACTIONS.minimize)}
          aria-label={t('app.window.minimize')}
        >
          <Minimize />
        </button>
      </HoverTooltip>
      <HoverTooltip body={maxLabel} side="bottom">
        <button
          type="button"
          className={styles.btn}
          onClick={() => postWindowAction(QOS_WINDOW_ACTIONS.toggleMaximize)}
          aria-label={maxLabel}
        >
          {maximized ? <Restore /> : <Maximize />}
        </button>
      </HoverTooltip>
      <HoverTooltip body={t('app.window.close')} side="bottom">
        <button
          type="button"
          className={`${styles.btn} ${styles.close}`}
          onClick={() => postWindowAction(QOS_WINDOW_ACTIONS.close)}
          aria-label={t('app.window.close')}
        >
          <Close />
        </button>
      </HoverTooltip>
    </div>
  );
}
