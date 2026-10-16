import styles from './BuildWidget.module.scss';

/** Generic dual-chamber case outline; `plus` draws a plus sign on the glass. */
export function BuildCaseSilhouette({ plus = false }: { plus?: boolean }) {
  return (
    <svg className={styles.silhouette} viewBox="0 0 100 120" aria-hidden="true" focusable="false">
      <rect className={styles.body} x="8" y="6" width="84" height="104" rx="6" />
      <path className={styles.glass} d="M14 12 H64 L72 20 V98 H14 Z" />
      <circle className={styles.fan} cx="43" cy="42" r="13" />
      <circle className={styles.fan} cx="43" cy="76" r="13" />
      <line className={styles.divider} x1="75" y1="12" x2="75" y2="98" />
      <path className={styles.slits} d="M80 24 H86 M80 32 H86 M80 40 H86 M80 48 H86" />
      <rect className={styles.foot} x="16" y="110" width="12" height="5" rx="1.5" />
      <rect className={styles.foot} x="72" y="110" width="12" height="5" rx="1.5" />
      {plus && <path className={styles.plus} d="M43 54 V64 M38 59 H48" />}
    </svg>
  );
}
