import styles from './PageSkeleton.module.scss';

export function MonitoringSkeleton() {
  return (
    <div className={styles.monitoring}>
      <div className={styles.chart} />
      <div className={styles.statRow}>
        <div className={styles.statCard} />
        <div className={styles.statCard} />
        <div className={styles.statCard} />
        <div className={styles.statCard} />
      </div>
      <div className={styles.listPair}>
        <div className={styles.listCard} />
        <div className={styles.listCard} />
      </div>
    </div>
  );
}

export function LightingSkeleton() {
  return (
    <div className={styles.lighting}>
      <div className={styles.strip} />
      <div className={styles.effectGrid}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className={styles.effectTile} />
        ))}
      </div>
    </div>
  );
}

export function CoolingSkeleton() {
  return (
    <div className={styles.cooling}>
      <div className={styles.fanGrid}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={styles.fanCard} />
        ))}
      </div>
      <div className={styles.curveCard} />
    </div>
  );
}

export function DevicesSkeleton() {
  return (
    <div className={styles.devices}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className={styles.deviceCard} />
      ))}
    </div>
  );
}

export function GenericSkeleton() {
  return (
    <div className={styles.generic}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className={styles.block} />
      ))}
    </div>
  );
}
