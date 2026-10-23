import styles from './BuildWidget.module.scss';

// Side of a dual-chamber case: main chamber plus a side chamber with three fans. Strokes stay fixed width at any tile size.
export function BuildCaseSilhouette() {
  return (
    <svg
      className={styles.silhouette}
      viewBox="0 0 120 96"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      <g transform="translate(12 0)">
        <rect x="20" y="8" width="56" height="74" rx="3" vectorEffect="non-scaling-stroke" />
        <path d="M50 8v74M28 82v5M68 82v5" vectorEffect="non-scaling-stroke" />
        <circle cx="63" cy="24" r="6" vectorEffect="non-scaling-stroke" />
        <circle cx="63" cy="45" r="6" vectorEffect="non-scaling-stroke" />
        <circle cx="63" cy="66" r="6" vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}
