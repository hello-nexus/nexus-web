import type { ReactNode, Ref } from 'react';
import styles from './ChartHoverTooltip.module.scss';

// The hover value box shared by chart surfaces (time-series charts, the
// fan-curve editor). Placement is the caller's job - pair the ref with
// useChartHoverTooltip inside a position:relative wrapper.
export function ChartHoverTooltip({ ref, children }: { ref?: Ref<HTMLDivElement>; children: ReactNode }) {
  return <div ref={ref} className={styles.tooltip}>{children}</div>;
}

export function ChartTooltipHeader({ children }: { children: ReactNode }) {
  return <div className={styles.tooltipHeader}>{children}</div>;
}

// One series row: color dot (omitted when no color), dim name, value(s) via
// ChartTooltipVal children.
export function ChartTooltipRow({ color, name, children }: { color?: string; name: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.tooltipRow}>
      {color && <span className={styles.tooltipDot} style={{ background: color }} />}
      <span className={styles.tooltipName}>{name}</span>
      {children}
    </div>
  );
}

export function ChartTooltipVal({ children }: { children: ReactNode }) {
  return <span className={styles.tooltipVal}>{children}</span>;
}
