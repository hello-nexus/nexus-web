import { useTranslation } from '../../../../lib/i18n';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import styles from '../LightingPage.module.scss';

/**
 * OpenRGB status indicator at the top-right of the lighting view. The
 * dot reflects the openrgb-headless process state; the glyph is a
 * monochrome OpenRGB logo: donut ring (outer CW, inner CCW) with a
 * collar + screw base overlaid (CW). Nonzero fill rule lets the collar
 * + base cross the ring, leaving the bulb glass as negative space.
 */
function OpenRgbGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size}
      viewBox="0 0 24 24" fill="currentColor"
      aria-hidden>
      <path d="M12 1a9 9 0 1 1 0 18 9 9 0 1 1 0-18zM12 4a6 6 0 1 0 0 12 6 6 0 1 0 0-12zM10.5 13L13.5 13 13.5 16 16 16 16 22 8 22 8 16 10.5 16z" />
    </svg>
  );
}

export function RgbStatusCard({ rgbRunning, onClick, title }: {
  rgbRunning: boolean;
  /** When provided, the card renders as a button (opens the supported-devices modal). */
  onClick?: () => void;
  title?: string;
}) {
  const { t } = useTranslation();
  const status = rgbRunning ? t('lighting.openrgb.running') : t('lighting.openrgb.notRunning');
  const dot = (
    <span className={`${styles.statusDot} ${rgbRunning ? styles.statusDotOnline : styles.statusDotOffline}`} />
  );
  if (onClick) {
    const btn = (
      <button
        type="button"
        className={styles.statusCard}
        onClick={onClick}
        aria-label={title ?? status}
      >
        <OpenRgbGlyph />
        {/* eslint-disable-next-line i18next/no-literal-string -- OpenRGB brand name */}
        <span className={styles.statusBadgeLabel}>OpenRGB</span>
        {dot}
      </button>
    );
    return title ? <HoverTooltip body={title} side="top">{btn}</HoverTooltip> : btn;
  }
  return (
    <div className={styles.statusCard} role="status" aria-label={status}>
      <OpenRgbGlyph />
      {/* eslint-disable-next-line i18next/no-literal-string -- OpenRGB brand name */}
      <span className={styles.statusBadgeLabel}>OpenRGB</span>
      {dot}
    </div>
  );
}
