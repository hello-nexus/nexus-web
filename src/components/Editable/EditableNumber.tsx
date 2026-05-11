import { useEditable } from './useEditable';
import styles from './Editable.module.scss';

/*
 * Click-to-edit number. Pairs with a slider in the Slider primitive so the
 * user can either drag for coarse changes or type for precise ones. The
 * commit signature exposes a `committed=true` flag to the parent so
 * downstream code can persist the typed value in one shot (no separate
 * onCommit fire needed - state and persist happen together).
 */
export interface EditableNumberProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onCommit: (value: number) => void;
  format?: (value: number) => string;
  className?: string;
  ariaLabel?: string;
}

export function EditableNumber({ value, min, max, step = 1, onCommit, format, className, ariaLabel }: EditableNumberProps) {
  const fmt = format ?? ((v: number) => String(v));
  const editable = useEditable<number>({
    value,
    onCommit,
    parse: draft => {
      const parsed = Number(draft);
      if (!Number.isFinite(parsed)) return null;
      const clamped = Math.max(min, Math.min(max, parsed));
      // Snap to `step` so a free-typed value (e.g. 0.37 on a 0.1-step slider)
      // commits to the same grid the range input + slider display use. Without
      // this, the stored number drifts from what the user sees once the
      // display's formatValue rounds back (display lies, value stays off-grid).
      if (step > 0) {
        const snapped = Math.round((clamped - min) / step) * step + min;
        // Round away tiny float drift (0.1 + 0.2 = 0.30000000000000004).
        const decimals = (step.toString().split('.')[1] ?? '').length;
        return Number(snapped.toFixed(decimals));
      }
      return clamped;
    },
    format: v => String(v),
  });

  if (editable.editing) {
    return (
      <input
        type="number"
        className={`${styles.input} ${styles.inputNumber} ${className ?? ''}`}
        min={min}
        max={max}
        step={step}
        aria-label={ariaLabel}
        {...editable.inputProps}
      />
    );
  }

  return (
    <span
      className={`${styles.display} ${className ?? ''}`}
      onClick={editable.start}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); editable.start(); } }}
    >
      {fmt(value)}
    </span>
  );
}
