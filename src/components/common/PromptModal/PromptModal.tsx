import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { Overlay } from '../Overlay/Overlay';
import styles from './PromptModal.module.scss';

interface PromptModalProps {
  open: boolean;
  title: string;
  message?: string;
  placeholder?: string;
  initialValue?: string;
  maxLength?: number;
  confirmLabel?: string;
  cancelLabel?: string;
  /**
   * Sync validator. Return an error string to block submit and display
   * inline, or null/undefined when the value is acceptable. Runs live as
   * the user types and again on submit.
   */
  validate?: (value: string) => string | null | undefined;
  /**
   * May return (or resolve to) an error string instead of committing - the
   * modal stays open and displays it immediately, through the same slot as
   * `validate`. Used for a server-side rejection (e.g. a 409 name collision)
   * that a synchronous `validate` can't catch. A void/undefined result is a
   * normal commit; the caller is responsible for closing the modal.
   */
  onConfirm: (value: string) => void | string | null | undefined | Promise<void | string | null | undefined>;
  onCancel: () => void;
}

/**
 * In-app text-input modal. Replaces window.prompt so the look is themed and
 * consistent across macOS / Linux / Windows (WKWebView, Edge kiosk, and
 * browsers all suppress or restyle native prompts differently). Composes
 * Overlay with variant="alert" so it inherits the centered backdrop blur,
 * Esc-cancel, and Enter-submit wiring used by ConfirmModal.
 */
export function PromptModal({
  open,
  title,
  message,
  placeholder,
  initialValue = '',
  maxLength,
  confirmLabel,
  cancelLabel,
  validate,
  onConfirm,
  onCancel,
}: PromptModalProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const errorId = useId();
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Bumped on every open-transition so a still-pending onConfirm from a
  // cancelled-then-reopened cycle can't land its error on the new session.
  const attemptRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    // Reset form state when the modal transitions from closed -> open. The
    // caller may pass a new initialValue between open cycles; we can't
    // useMemo this because the user then types into `value`.

    attemptRef.current += 1;
    setValue(initialValue);
    setError(null);
    setSubmitting(false);
    // Defer focus to the next frame so the Overlay surface has mounted.
    const handle = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(handle);
  }, [open, initialValue]);

  if (!open) return null;

  const submit = () => {
    if (submitting) return;
    const trimmed = value;
    if (validate) {
      const err = validate(trimmed);
      if (err) {
        setError(err);
        return;
      }
    }
    if (!trimmed.trim()) {
      // Don't fire onConfirm for empty input - cancel instead so the caller
      // doesn't have to defensively trim+check.
      onCancel();
      return;
    }
    const result = onConfirm(trimmed);
    if (result instanceof Promise) {
      const attempt = attemptRef.current;
      setSubmitting(true);
      result.then(err => {
        if (attemptRef.current !== attempt) return; // superseded by a later open cycle
        setSubmitting(false);
        if (err) setError(err);
      }).catch(() => {
        if (attemptRef.current !== attempt) return;
        setSubmitting(false);
      });
      return;
    }
    if (result) setError(result);
  };

  const handleChange = (next: string) => {
    setValue(next);
    if (!validate) return;
    const err = validate(next);
    setError(err ?? null);
  };

  const isInvalid = error != null;
  const submitDisabled = isInvalid || !value.trim() || submitting;

  return (
    <Overlay open={open} onClose={onCancel} variant="alert" onEnter={submit}
      className={styles.modal} ariaLabel={title}>
      <h2 id={inputId + '-title'} className={styles.title}>{title}</h2>
      <div className={styles.fieldWrap}>
        {message && <label htmlFor={inputId} className={styles.message}>{message}</label>}
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(e) => handleChange(e.target.value)}
          className={styles.input}
          aria-invalid={isInvalid || undefined}
          aria-describedby={isInvalid ? errorId : undefined}
          autoComplete="off"
          spellCheck={false}
        />
        {isInvalid && <p id={errorId} className={styles.error} role="alert">{error}</p>}
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>
          {cancelLabel ?? t('confirm.cancel')}
        </button>
        <button type="button"
          className={styles.confirmBtn}
          onClick={submit}
          disabled={submitDisabled}>
          {confirmLabel ?? t('confirm.ok')}
        </button>
      </div>
    </Overlay>
  );
}
