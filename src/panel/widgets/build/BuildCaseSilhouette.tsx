import styles from './BuildWidget.module.scss';

// Static 3/4 projection of a dual-chamber case: shell, glass-corner chamfer, base, board and a three-fan GPU.
export function BuildCaseSilhouette() {
  return (
    <svg className={styles.silhouette} viewBox="105 160 800 760" aria-hidden="true" focusable="false">
      <path className={styles.shell} d="M125 195 L362 178 L884 194 L855 770 L728 885 L585 900 L155 800 Z" />
      <path className={styles.edge} d="M125 195 L760 207 L884 194 M760 207 V835 L728 885 M585 900 L595 808 L760 835" />
      <path className={styles.part} d="M305 318 L563 335 V600 L310 535 Z" />
      <path className={styles.part} d="M187 575 L595 613 V808 L190 725 Z" />
      <path className={styles.edge} d="M187 575 L245 556 L637 615 V780 L595 808 M595 613 L637 615" />
      <ellipse className={styles.edge} cx="250" cy="658" rx="50" ry="55" />
      <ellipse className={styles.edge} cx="380" cy="685" rx="53" ry="57" />
      <ellipse className={styles.edge} cx="518" cy="708" rx="57" ry="60" />
    </svg>
  );
}
