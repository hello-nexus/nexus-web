import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { Overlay } from '../Overlay/Overlay';
import { Button } from '../Button/Button';
import styles from './ConfirmModal.module.scss';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  /** Body text. May contain plain newlines; they are rendered as paragraph breaks. */
  message: string;
  /** Optional bulleted list rendered below the message (e.g. items affected). */
  bullets?: string[];
  /** Optional secondary hint rendered in a dimmed block below the main message. */
  note?: string;
  /** 'danger' renders the note as a red-bordered callout with red text. */
  noteTone?: 'default' | 'danger';
  /** Extra content rendered after the note, before the actions row (e.g. a password field for a destructive confirm). */
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style the confirm button as destructive (red). Default true since this is used for deletes. */
  destructive?: boolean;
  /** Disables the confirm button, e.g. while a caller-tracked async onConfirm is still in flight. */
  confirmDisabled?: boolean;
  /**
   * Optional third action, rendered as the primary button with confirm
   * demoted beside it. For a prompt where the safe way out is doing the work
   * rather than abandoning it: "you have unsaved edits" offers Save here and
   * keeps Discard as the confirm.
   */
  primaryAction?: { label: string; onSelect: () => void; disabled?: boolean };
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Native-in-app modal confirmation. Matches the app chrome (backdrop blur +
 * elevated surface + accent token for the primary button). Used instead of
 * window.confirm so the UI is themed and can carry multi-line context.
 *
 * Esc cancels, Enter confirms, click outside cancels. Autofocuses Cancel so
 * destructive actions require an explicit user intent.
 */
export function ConfirmModal({
  open,
  title,
  message,
  bullets,
  note,
  noteTone = 'default',
  children,
  confirmLabel,
  cancelLabel,
  destructive = true,
  confirmDisabled = false,
  primaryAction,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const { t } = useTranslation();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const paragraphs = message.split(/\n+/).filter(p => p.length > 0);

  return (
    <Overlay open={open} onClose={onCancel} variant="alert" onEnter={confirmDisabled ? undefined : onConfirm}
      className={styles.modal} ariaLabel={title}>
      <h2 className={styles.title}>{title}</h2>
      <div className={styles.body}>
        {paragraphs.map((p, i) => <p key={i} className={styles.text}>{p}</p>)}
        {bullets && bullets.length > 0 && (
          <ul className={styles.bullets}>
            {bullets.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        )}
        {note && <p className={noteTone === 'danger' ? styles.noteDanger : styles.note}>{note}</p>}
        {children}
      </div>
      <div className={styles.actions}>
        <Button ref={cancelRef} tone="neutral" size="md" onClick={onCancel}>
          {cancelLabel ?? t('confirm.cancel')}
        </Button>
        <Button
          // With a primary action present, confirm is the other way out and
          // never the accent button.
          tone={destructive ? 'danger-solid' : primaryAction ? 'neutral' : 'accent'}
          size="md"
          onClick={onConfirm}
          disabled={confirmDisabled}>
          {confirmLabel ?? t('confirm.ok')}
        </Button>
        {primaryAction && (
          <Button
            tone="accent"
            size="md"
            onClick={primaryAction.onSelect}
            disabled={primaryAction.disabled}>
            {primaryAction.label}
          </Button>
        )}
      </div>
    </Overlay>
  );
}
