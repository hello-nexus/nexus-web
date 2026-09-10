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
/**
 * Cap for a lighting or cooling device or group name. Longer than the 20-char
 * default because these are the names users write sentences into - "Front
 * radiator intake", "Corsair QL Fan 3" - and the service stores them uncapped.
 */
export const DEVICE_NAME_MAX_LENGTH = 40;

export interface EditableTextProps {
  value: string;
  onCommit: (value: string) => void;
  maxLength?: number;
  className?: string;
  ariaLabel?: string;
  /**
   * Whether clicking the text starts an edit. False leaves renaming to the
   * imperative handle alone, for names that sit on something else clickable -
   * a device card or a group header, where a click on the title should select
   * or collapse rather than drop into a text field. The context menu's Rename
   * still works, because that calls startEditing() directly.
   */
  clickToEdit?: boolean;
}

export interface EditableTextHandle {
  startEditing: () => void;
}

export const EditableText = forwardRef<EditableTextHandle, EditableTextProps>(function EditableText(
  { value, onCommit, maxLength = 20, className, ariaLabel, clickToEdit = true }, ref,
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

  // Without click-to-edit the text is not a control, so it must not advertise
  // itself as one: no button role, no tab stop, no Enter/Space handler, and
  // none of the hover affordance either.
  if (!clickToEdit) {
    return <span className={`${styles.displayStatic} ${className ?? ''}`}>{value}</span>;
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
