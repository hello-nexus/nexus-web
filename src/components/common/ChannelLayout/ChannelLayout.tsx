import { useId, type ReactNode } from 'react';
import classNames from 'classnames';
import styles from './ChannelLayout.module.scss';

export interface ChannelNode {
  id: string;
  label: string;
  /** From the center: x runs left (-1) to right (1), y runs front (-1) to back (1). */
  pos: { x: number; y: number };
  icon?: ReactNode;
  /** Rendered under the label, e.g. a volume stepper. */
  control?: ReactNode;
}

export interface ChannelLayoutProps {
  nodes: readonly ChannelNode[];
  /** A click or Enter on a node. */
  onActivate?: (id: string) => void;
  /** Node shown lit, e.g. the one playing its test sound. */
  activeId?: string | null;
  /** Spoken after a node's label, e.g. what a click does. */
  hint?: string;
  /** What sits at the center, e.g. the listener. */
  center?: ReactNode;
  /** Layout box width over height. */
  aspect?: number;
  ariaLabel?: string;
  className?: string;
}

/**
 * Labeled nodes placed around a center, e.g. speakers around a listener. Every node has the
 * same anatomy: a round button (the icon), its label, and an optional control, stacked and
 * centered on its position. Each button reports a click.
 */
export function ChannelLayout({ nodes, onActivate, activeId, hint, center, aspect = 1.1, ariaLabel, className }: ChannelLayoutProps) {
  const hintId = useId();
  return (
    <div className={classNames(styles.root, className)} role="group" aria-label={ariaLabel}>
      {hint && <span id={hintId} className={styles.hint}>{hint}</span>}
      <div className={styles.field} style={{ paddingTop: `${100 / aspect}%` }}>
        {center && <div className={styles.center}>{center}</div>}
        {nodes.map(node => (
          <div
            key={node.id}
            className={styles.node}
            style={{ left: `${50 + node.pos.x * 50}%`, top: `${50 + node.pos.y * 50}%` }}
          >
            <button
              type="button"
              className={classNames(styles.handle, activeId === node.id && styles.active)}
              aria-label={node.label}
              aria-describedby={hint ? hintId : undefined}
              onClick={() => onActivate?.(node.id)}
            >
              {node.icon}
            </button>
            <span className={styles.label} aria-hidden>{node.label}</span>
            {node.control}
          </div>
        ))}
      </div>
    </div>
  );
}
