import { useEffect, useRef, useState } from 'react';

/*
 * Shared edit-mode state for click-to-edit text and number controls.
 *
 * Caller owns the committed value; the hook owns the in-flight `draft` and
 * `editing` flag. On commit we run the optional `parse` to coerce the draft
 * into a final value, fire `onCommit(value)` if it differs from the current
 * value, then leave edit mode. Escape leaves edit mode without firing.
 *
 * The input ref is auto-selected when edit mode opens so the user can start
 * typing immediately - matches the legacy EditableName behaviour.
 */
export interface UseEditableOptions<T> {
  value: T;
  onCommit: (next: T) => void;
  parse: (draft: string) => T | null;
  format?: (value: T) => string;
}

export interface UseEditableHandle {
  editing: boolean;
  draft: string;
  setDraft: (s: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  start: (e?: React.SyntheticEvent) => void;
  commit: () => void;
  cancel: () => void;
  /* Pre-built handlers for the input element. */
  inputProps: {
    ref: React.RefObject<HTMLInputElement | null>;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onBlur: () => void;
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    onClick: (e: React.MouseEvent) => void;
  };
}

export function useEditable<T>({ value, onCommit, parse, format }: UseEditableOptions<T>): UseEditableHandle {
  const fmt = format ?? ((v: T) => String(v));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => fmt(value));
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const start = (e?: React.SyntheticEvent) => {
    e?.stopPropagation();
    setDraft(fmt(value));
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const parsed = parse(draft);
    if (parsed === null) return;
    if (parsed === value) return;
    onCommit(parsed);
  };

  const cancel = () => {
    setEditing(false);
    setDraft(fmt(value));
  };

  return {
    editing, draft, setDraft, inputRef, start, commit, cancel,
    inputProps: {
      ref: inputRef,
      value: draft,
      onChange: e => setDraft(e.target.value),
      onBlur: commit,
      onClick: e => e.stopPropagation(),
      onKeyDown: e => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      },
    },
  };
}
