import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import styles from './EventTimeline.module.scss';

export interface EventTimelineLane {
  id: string;
  label: string;
}

export interface EventTimelineEvent {
  id: string;
  laneId: string;
  /** Epoch milliseconds. */
  t: number;
  /** Dot color (a CSS color or var()). */
  color: string;
  /** Higher wins when a cluster mixes colors; the cluster takes the color of
   *  its highest-weight event. Defaults to 0. */
  weight?: number;
}

export interface EventTimelineCluster<E extends EventTimelineEvent> {
  laneId: string;
  /** Time of the cluster's anchor (its earliest event). */
  t: number;
  color: string;
  events: E[];
}

export interface EventTimelineProps<E extends EventTimelineEvent> {
  lanes: readonly EventTimelineLane[];
  events: readonly E[];
  /** [minT, maxT] epoch-ms window the x-axis spans. */
  domain: readonly [number, number];
  xTickFormat: (t: number) => string;
  xTickCount?: number;
  laneHeight?: number;
  /** Tooltip body for the hovered cluster; the shell (position, chrome) is the
   *  component's. */
  renderTooltip: (cluster: EventTimelineCluster<E>) => ReactNode;
  /** Cluster key (`${laneId}:${firstEventId}`) of the currently-selected dot,
   *  drawn with a persistent highlight. Selection is controlled by the caller. */
  selectedKey?: string | null;
  /** Fired when a dot is clicked, so the caller can open the cluster's detail. */
  onSelect?: (cluster: EventTimelineCluster<E>) => void;
  ariaLabel?: string;
  emptyLabel?: string;
}

/** The stable cluster key a caller compares against `selectedKey`. */
export function eventTimelineClusterKey<E extends EventTimelineEvent>(cluster: EventTimelineCluster<E>): string {
  return `${cluster.laneId}:${cluster.events[0].id}`;
}

const PAD = { top: 14, bottom: 26 };
// Horizontal breathing room so a dot at the domain's edge is not half-clipped.
const INSET = 10;
const DOT_R = 4.5;
// Invisible hit circle, larger than the visible dot, so a small dot stays
// comfortably hoverable/tappable.
const HIT_R = 11;
// Must track .tooltip max-width in EventTimeline.module.scss; used to decide
// which side the tooltip opens toward so it stays inside the card.
const TOOLTIP_MAX_W = 300;
// Same-lane events whose dot x-positions fall within this many px collapse into
// one cluster, so a wide range does not render an unreadable smear of dots.
const CLUSTER_PX = 10;

function laneCenterY(index: number, laneHeight: number): number {
  return PAD.top + index * laneHeight + laneHeight / 2;
}

/**
 * A swimlane event timeline: one horizontal lane per category, discrete events
 * plotted as dots at their exact time, colored by the caller. Near-coincident
 * same-lane events collapse into a single dot (count shown) so wide time ranges
 * stay legible. Chrome (dot hit targets, anchored tooltip, x-axis ticks) mirrors
 * TimeSeriesChart's conventions so the two charts read as one system.
 */
export function EventTimeline<E extends EventTimelineEvent>({
  lanes, events, domain, xTickFormat, xTickCount = 5, laneHeight = 34, renderTooltip,
  selectedKey, onSelect, ariaLabel, emptyLabel,
}: EventTimelineProps<E>) {
  const plotRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(440);
  const [activeId, setActiveId] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const initialW = el.getBoundingClientRect().width;
    if (initialW > 0) setWidth(Math.round(initialW));
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setWidth(Math.round(w));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [minT, maxT] = domain;
  const span = maxT - minT || 1;
  const plotW = Math.max(1, width);
  const xFor = (t: number) => INSET + ((t - minT) / span) * (plotW - 2 * INSET);
  const height = PAD.top + lanes.length * laneHeight + PAD.bottom;

  const laneIndex = useMemo(() => {
    const map = new Map<string, number>();
    lanes.forEach((lane, i) => map.set(lane.id, i));
    return map;
  }, [lanes]);

  // Cluster near-coincident same-lane events. Depends on width because
  // proximity is measured in rendered pixels, not raw time.
  const clusters = useMemo(() => {
    const byLane = new Map<string, E[]>();
    for (const ev of events) {
      if (!laneIndex.has(ev.laneId)) continue;
      const list = byLane.get(ev.laneId);
      if (list) list.push(ev);
      else byLane.set(ev.laneId, [ev]);
    }
    const out: EventTimelineCluster<E>[] = [];
    for (const [laneId, list] of byLane) {
      const sorted = [...list].sort((a, b) => a.t - b.t);
      let bucket: E[] = [];
      let anchorX = 0;
      const flush = () => {
        if (bucket.length === 0) return;
        let best = bucket[0];
        for (const e of bucket) if ((e.weight ?? 0) > (best.weight ?? 0)) best = e;
        out.push({ laneId, t: bucket[0].t, color: best.color, events: bucket });
      };
      for (const ev of sorted) {
        // Inlined xFor so this memo's deps fully cover the pixel math (no
        // exhaustive-deps suppression); identical to xFor(ev.t).
        const x = INSET + ((ev.t - minT) / span) * (plotW - 2 * INSET);
        if (bucket.length === 0) {
          bucket = [ev];
          anchorX = x;
        } else if (x - anchorX <= CLUSTER_PX) {
          bucket.push(ev);
        } else {
          flush();
          bucket = [ev];
          anchorX = x;
        }
      }
      flush();
    }
    return out;
  }, [events, laneIndex, minT, span, plotW]);

  const xTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let i = 0; i < xTickCount; i++) {
      const frac = xTickCount > 1 ? i / (xTickCount - 1) : 0;
      ticks.push(Math.round(minT + frac * span));
    }
    return ticks;
  }, [minT, span, xTickCount]);

  // The tooltip follows the hovered dot only; selection (the persistent
  // highlight) is controlled by the caller via selectedKey/onSelect.
  const active = activeId ? clusters.find(c => eventTimelineClusterKey(c) === activeId) ?? null : null;

  if (lanes.length === 0) {
    return (
      <div className={styles.wrap}>
        <div className={styles.empty}>{emptyLabel ?? ''}</div>
      </div>
    );
  }

  const axisY = PAD.top + lanes.length * laneHeight;

  return (
    <div className={styles.wrap}>
      <div className={styles.grid} style={{ gridTemplateRows: `${height}px` }}>
        <div className={styles.lanes} style={{ paddingTop: PAD.top }}>
          {lanes.map(lane => (
            <div key={lane.id} className={styles.laneLabel} style={{ height: laneHeight }} title={lane.label}>
              {lane.label}
            </div>
          ))}
        </div>

        <div className={styles.plot} ref={plotRef}>
          <svg
            className={styles.svg}
            width={plotW}
            height={height}
            viewBox={`0 0 ${plotW} ${height}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={ariaLabel}
          >
            {lanes.map((lane, i) => {
              const y = laneCenterY(i, laneHeight);
              return <line key={lane.id} x1={0} y1={y} x2={plotW} y2={y} stroke="var(--border)" strokeWidth="0.5" />;
            })}

            {xTicks.map((tick, i) => (
              <text
                key={i}
                x={Math.min(Math.max(xFor(tick), 0), plotW)}
                y={axisY + 18}
                fill="var(--text-dim)"
                fontSize="11"
                fontFamily="var(--font-mono)"
                textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
              >
                {xTickFormat(tick)}
              </text>
            ))}

            {clusters.map(cluster => {
              const cx = xFor(cluster.t);
              const cy = laneCenterY(laneIndex.get(cluster.laneId) ?? 0, laneHeight);
              const key = eventTimelineClusterKey(cluster);
              const isHovered = key === activeId;
              const isSelected = key === selectedKey;
              const isEmphasized = isHovered || isSelected;
              const count = cluster.events.length;
              return (
                <g key={key} className={styles.dotGroup}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={HIT_R}
                    fill="transparent"
                    onMouseEnter={() => setActiveId(key)}
                    onMouseLeave={() => setActiveId(prev => (prev === key ? null : prev))}
                    onClick={e => { e.stopPropagation(); onSelect?.(cluster); }}
                  />
                  <circle cx={cx} cy={cy} r={isEmphasized ? DOT_R + 1.5 : DOT_R} fill={cluster.color} pointerEvents="none" />
                  {isEmphasized && (
                    <circle cx={cx} cy={cy} r={DOT_R + 3.5} fill="none" stroke={cluster.color} strokeOpacity={isSelected ? 0.75 : 0.4} strokeWidth="1.5" pointerEvents="none" />
                  )}
                  {count > 1 && (
                    <text x={cx + DOT_R + 4} y={cy + 3.5} fill="var(--text-dim)" fontSize="10" fontFamily="var(--font-mono)" pointerEvents="none">
                      {count > 99 ? '99+' : count}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {active && (
            <TooltipShell
              cx={xFor(active.t)}
              cy={laneCenterY(laneIndex.get(active.laneId) ?? 0, laneHeight)}
              plotW={plotW}
              plotH={height}
            >
              {renderTooltip(active)}
            </TooltipShell>
          )}
        </div>
      </div>
    </div>
  );
}

function TooltipShell({ cx, cy, plotW, plotH, children }: { cx: number; cy: number; plotW: number; plotH: number; children: ReactNode }) {
  const GAP = 10;
  // Open toward whichever side/vertical half has room, so a dot near the right
  // edge, or in the top or bottom lane, does not push the tooltip off the card.
  const openLeft = cx + GAP + TOOLTIP_MAX_W > plotW;
  const openUp = cy > plotH * 0.55;
  return (
    <div
      className={styles.tooltip}
      style={{
        left: cx,
        top: cy,
        transform: `translate(${openLeft ? `calc(-100% - ${GAP}px)` : `${GAP}px`}, ${openUp ? '-100%' : '0%'})`,
      }}
    >
      {children}
    </div>
  );
}
