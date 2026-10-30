import { Pencil, type LucideIcon } from 'lucide-react';
import type { CSSProperties } from 'react';
import styles from './EditHint.module.scss';

interface EditHintProps {
  /** Text under the pencil. Omit for an icon-only hint. */
  label?: string;
  /** Glyph over the label; the pencil by default. */
  icon?: LucideIcon;
  /** Extra class for host-specific overrides (colors, icon size). */
  className?: string;
  /** Places the glyph and label in this box (px, relative to the host) instead of centering them on the whole host. */
  area?: { left: number; top: number; width: number; height: number };
  /** Explicit glyph and label sizes (px) for a host whose box is not a widget cell, such as half of a round canvas. */
  fit?: { icon: number; font: number };
}

/**
 * Shared "click to edit" hover hint: a scrim over the whole host with a centered
 * pencil. The host must be position: relative and reveal it by styling
 * `:hover [data-edit-hint-overlay] { opacity: 1 }` in its own module; the data
 * attribute jumps module scope. Decorative and click-through, so the click lands
 * on the host itself, which carries the accessible name.
 */
export function EditHint({ label, className, icon: Icon = Pencil, area, fit }: EditHintProps) {
  const fitStyle = fit
    ? { '--edit-hint-icon-size': `${fit.icon}px`, '--edit-hint-label-size': `${fit.font}px`, '--panel-scale': 1 } as CSSProperties
    : undefined;
  const content = (
    <div className={styles.content}>
      <Icon className={styles.icon} />
      {label && <span className={styles.label} data-fit={fit ? 'true' : undefined}>{label}</span>}
    </div>
  );
  return (
    <div className={`${styles.root} ${className ?? ''}`} data-edit-hint-overlay="" aria-hidden="true" style={fitStyle}>
      {area ? (
        <div className={styles.area} style={{ left: area.left, top: area.top, width: area.width, height: area.height }}>{content}</div>
      ) : content}
    </div>
  );
}
