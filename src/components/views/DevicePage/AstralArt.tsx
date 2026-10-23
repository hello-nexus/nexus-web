import styles from './AstralDevicePage.module.scss';

// Degrees drawn per degree measured: real tilt is a fraction of a degree, so the art exaggerates it.
const GAIN = 8;
const MAX_DRAW = 14;
const draw = (deg: number) => Math.max(-MAX_DRAW, Math.min(MAX_DRAW, deg * GAIN));

/** The card from the side (sag) or from its end (lean), turned by the reading. */
export function AstralArt({ view, degrees, label }: { view: 'side' | 'end'; degrees: number; label: string }) {
  return (
    <svg className={styles.art} viewBox="0 0 120 60" role="img" aria-label={label}>
      <g className={styles.tilt} style={{ transform: `rotate(${draw(degrees)}deg)` }}>
        {view === 'side' ? (
          <>
            <rect className={styles.shell} x="12" y="18" width="96" height="24" rx="4" />
            <circle className={styles.fan} cx="34" cy="30" r="8" />
            <circle className={styles.fan} cx="60" cy="30" r="8" />
            <circle className={styles.fan} cx="86" cy="30" r="8" />
          </>
        ) : (
          <>
            <rect className={styles.shell} x="44" y="10" width="32" height="40" rx="3" />
            <rect className={styles.fan} x="70" y="10" width="6" height="40" />
          </>
        )}
      </g>
      <line className={styles.level} x1="4" y1="30" x2="116" y2="30" />
    </svg>
  );
}
