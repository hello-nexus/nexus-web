import { useEffect } from 'react';
import { useEditable } from './useEditable';
import styles from './Editable.module.scss';

/*
 * Click-to-edit number. Pairs with a slider in the Slider primitive so the
 * user can either drag for coarse changes or type for precise ones. Fires
 * onCommit once with the typed value on Enter / blur.
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
  /** Shows the value as plain text: no click or keyboard entry into edit mode. */
  disabled?: boolean;
  /** No single committed value: the display reads `mixedLabel`, and the edit field opens
   *  empty with it as the placeholder. Any typed value commits, even one equal to `value`. */
  mixed?: boolean;
  mixedLabel?: string;
  /** For a slider whose value is not what the user reads (an index shown as a label): the field edits
   *  `toEntry(value)` and a typed number goes through `fromEntry` before the clamp and snap. */
  entryMap?: { toEntry: (value: number) => number; fromEntry: (typed: number) => number };
}

export function EditableNumber({ value, min, max, step = 1, onCommit, format, className, ariaLabel, disabled, mixed = false, mixedLabel, entryMap }: EditableNumberProps) {
  const fmt = format ?? ((v: number) => String(v));
  const editable = useEditable<number>({
    // NaN never equals a typed number, so a mixed edit always commits.
    value: mixed ? Number.NaN : value,
    onCommit,
    parse: draft => {
      // Number('') is 0, which would clamp to min: an empty draft is a cancel, never a value.
      if (draft.trim() === '') return null;
      const typed = Number(draft);
      if (!Number.isFinite(typed)) return null;
      const parsed = entryMap ? entryMap.fromEntry(typed) : typed;
      const clamped = Math.max(min, Math.min(max, parsed));
      // Snap to `step` so a free-typed value (e.g. 0.37 on a 0.1-step slider)
      // commits to the same grid the range input + slider display use;
      // otherwise the stored value sits off-grid from what formatValue shows.
      if (step > 0) {
        const snapped = Math.round((clamped - min) / step) * step + min;
        // Round away tiny float drift (0.1 + 0.2 = 0.30000000000000004).
        const decimals = (step.toString().split('.')[1] ?? '').length;
        return Number(snapped.toFixed(decimals));
      }
      return clamped;
    },
    format: v => (Number.isNaN(v) ? '' : String(entryMap ? entryMap.toEntry(v) : v)),
  });

  // Going read-only mid-edit drops the draft, so no stale input returns on re-enable.
  const { editing, cancel } = editable;
  useEffect(() => {
    if (disabled && editing) cancel();
  }, [disabled, editing, cancel]);

  if (disabled) {
    return (
      <span className={`${styles.displayStatic} ${className ?? ''}`}>
        {mixed ? mixedLabel : fmt(value)}
        {ariaLabel && <span className={styles.visuallyHidden}>{ariaLabel}</span>}
      </span>
    );
  }

  if (editable.editing) {
    return (
      <input
        type="number"
        className={`${styles.input} ${styles.inputNumber} ${className ?? ''}`}
        min={entryMap ? entryMap.toEntry(min) : min}
        max={entryMap ? entryMap.toEntry(max) : max}
        step={entryMap ? undefined : step}
        aria-label={ariaLabel}
        placeholder={mixed ? mixedLabel : undefined}
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
      {mixed ? mixedLabel : fmt(value)}
    </span>
  );
}
