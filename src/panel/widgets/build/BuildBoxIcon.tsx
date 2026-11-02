import styles from './BuildWidget.module.scss';

// A plain case as a cuboid in isometric view: top, front and one side. Strokes stay fixed width at any tile size.
export function BuildBoxIcon() {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 120 96"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M60 8L90 22V70L60 88L30 70V22Z" vectorEffect="non-scaling-stroke" />
      <path d="M30 22L60 36L90 22M60 36V88" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
