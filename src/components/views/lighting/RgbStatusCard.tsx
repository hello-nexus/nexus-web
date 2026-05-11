import styles from '../LightingView.module.scss';

/**
 * Tiny OpenRGB status indicator at the top right of the lighting view. The dot
 * reflects the bundled openrgb-headless process state; the glyph is a monochrome
 * silhouette of the real OpenRGB logo: a filled donut ring (outer CW, inner CCW)
 * with a filled collar + screw base overlaid (CW). Nonzero fill rule lets the
 * collar + base cross the ring seamlessly, leaving just the bulb glass as
 * negative space.
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

export function RgbStatusCard({ rgbRunning }: { rgbRunning: boolean }) {
  return (
    <div className={styles.statusCard}
      role="status"
      aria-label={rgbRunning ? 'OpenRGB running' : 'OpenRGB not running'}>
      <OpenRgbGlyph />
      <span className={styles.statusBadgeLabel}>OpenRGB</span>
      <span className={`${styles.statusDot} ${rgbRunning ? styles.statusDotOnline : styles.statusDotOffline}`} />
    </div>
  );
}
