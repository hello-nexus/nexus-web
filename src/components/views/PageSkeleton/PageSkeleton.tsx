import styles from './PageSkeleton.module.scss';

export function GenericSkeleton() {
  return (
    <div className={styles.generic}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className={styles.block} />
      ))}
    </div>
  );
}
