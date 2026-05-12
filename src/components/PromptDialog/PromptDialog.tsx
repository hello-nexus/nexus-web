import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from '../../lib/i18n';
import { Overlay } from '../Overlay/Overlay';
import styles from './PromptDialog.module.scss';

interface PromptDialogProps {
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
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

/**
 * In-app text-input modal. Replaces window.prompt so the look is themed and
 * consistent across macOS / Linux / Windows (WKWebView, Edge kiosk, and
 * browsers all suppress or restyle native prompts differently). Composes
 * Overlay with variant="alert" so it inherits the centered backdrop blur,
 * Esc-cancel, and Enter-submit wiring used by ConfirmDialog.
 */
export function PromptDialog({
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
}: PromptDialogProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const errorId = useId();
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValue(initialValue);
    setError(null);
    // Defer focus to the next frame so the Overlay surface has mounted.
    const handle = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(handle);
  }, [open, initialValue]);

  if (!open) return null;

  const submit = () => {
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
    onConfirm(trimmed);
  };

  const handleChange = (next: string) => {
    setValue(next);
    if (!validate) return;
    const err = validate(next);
    setError(err ?? null);
  };

  const isInvalid = error != null;
  const submitDisabled = isInvalid || !value.trim();

  return (
    <Overlay open={open} onClose={onCancel} variant="alert" onEnter={submit}
      className={styles.dialog} ariaLabel={title}>
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
