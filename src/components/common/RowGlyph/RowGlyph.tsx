import type { ReactNode } from 'react';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import styles from './RowGlyph.module.scss';

/**
 * Right-aligned status glyph with a hover label on a device or nav row. Bare
 * (non-focusable) so it can sit inside a row that is itself a button; with
 * `onActivate` it becomes a focusable button-role span that does not trigger
 * the row's own click.
 */
export function RowGlyph({ icon, label, tone = 'dim', className, onActivate }: {
  icon: ReactNode;
  label: string;
  tone?: 'dim' | 'accent';
  className?: string;
  onActivate?: () => void;
}) {
  const cls = `${styles.glyph} ${styles[tone]} ${onActivate ? styles.actionable : ''} ${className ?? ''}`;
  if (!onActivate) {
    return (
      <HoverTooltip body={label} side="top">
        <span className={cls} role="img" aria-label={label}>
          {icon}
        </span>
      </HoverTooltip>
    );
  }
  return (
    <HoverTooltip body={label} side="top">
      <span
        className={cls}
        role="button"
        tabIndex={0}
        aria-label={label}
        onClick={e => {
          e.preventDefault();
          e.stopPropagation();
          onActivate();
        }}
        onKeyDown={e => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          e.stopPropagation();
          onActivate();
        }}
      >
        {icon}
      </span>
    </HoverTooltip>
  );
}
