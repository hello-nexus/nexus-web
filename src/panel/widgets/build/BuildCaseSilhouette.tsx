import styles from './BuildWidget.module.scss';

// Drawn on the lucide grid (24 box, default 2 stroke) so it weighs like the other widgets' empty-state icons.
export function BuildCaseSilhouette() {
  return (
    <svg
      className={styles.silhouette}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 7h10v11.5L12.5 21H5z" />
      <path d="M5 7l4-4h10v11.5l-4 4M15 7l4-4" />
      <circle cx="10" cy="13" r="2.5" />
    </svg>
  );
}
