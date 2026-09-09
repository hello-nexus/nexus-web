import { forwardRef, useImperativeHandle } from 'react';
import { useEditable } from './useEditable';
import styles from './Editable.module.scss';

/*
 * Click-to-edit string. Single click to enter edit mode, Enter or blur to
 * commit, Escape to revert. Caller controls the committed value via
 * `onCommit`; intermediate keystrokes are kept inside the hook.
 *
 * `maxLength` defaults to 20 (the fan/curve rename limit); pass a different
 * number for a wider input. The trimmed value is committed; empty is dropped.
 *
 * The ref opens edit mode from a menu's Rename row.
 */
export interface EditableTextProps {
  value: string;
  onCommit: (value: string) => void;
  maxLength?: number;
  className?: string;
  ariaLabel?: string;
}

export interface EditableTextHandle {
  startEditing: () => void;
}

export const EditableText = forwardRef<EditableTextHandle, EditableTextProps>(function EditableText(
  { value, onCommit, maxLength = 20, className, ariaLabel }, ref,
) {
  const editable = useEditable<string>({
    value,
    onCommit,
    parse: draft => {
      const trimmed = draft.trim().slice(0, maxLength);
      return trimmed ? trimmed : null;
    },
  });

  useImperativeHandle(ref, () => ({ startEditing: () => editable.start() }));

  if (editable.editing) {
    return <input className={`${styles.input} ${className ?? ''}`} maxLength={maxLength} aria-label={ariaLabel} {...editable.inputProps} />;
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
      {value}
    </span>
  );
});
