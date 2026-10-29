import { Pencil, type LucideIcon } from 'lucide-react';
import styles from './EditHint.module.scss';

interface EditHintProps {
  /** Text under the pencil. Omit for an icon-only hint. */
  label?: string;
  /** Glyph over the label; the pencil by default. */
  icon?: LucideIcon;
  /** Extra class for host-specific overrides (colors, icon size). */
  className?: string;
}

/**
 * Shared "click to edit" hover hint: a scrim over the whole host with a centered
 * pencil. The host must be position: relative and reveal it by styling
 * `:hover [data-edit-hint-overlay] { opacity: 1 }` in its own module; the data
 * attribute jumps module scope. Decorative and click-through, so the click lands
 * on the host itself, which carries the accessible name.
 */
export function EditHint({ label, className, icon: Icon = Pencil }: EditHintProps) {
  return (
    <div className={`${styles.root} ${className ?? ''}`} data-edit-hint-overlay="" aria-hidden="true">
      <div className={styles.content}>
        <Icon className={styles.icon} />
        {label && <span className={styles.label}>{label}</span>}
      </div>
    </div>
  );
}
