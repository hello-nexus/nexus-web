import { useEffect, useRef } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { Overlay } from '../Overlay/Overlay';
import styles from './ConfirmModal.module.scss';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  /** Body text. May contain plain newlines; they are rendered as paragraph breaks. */
  message: string;
  /** Optional secondary hint rendered in a dimmed block below the main message. */
  note?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style the confirm button as destructive (red). Default true since this is used for deletes. */
  destructive?: boolean;
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
  note,
  confirmLabel,
  cancelLabel,
  destructive = true,
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
    <Overlay open={open} onClose={onCancel} variant="alert" onEnter={onConfirm}
      className={styles.modal} ariaLabel={title}>
      <h2 className={styles.title}>{title}</h2>
      <div className={styles.body}>
        {paragraphs.map((p, i) => <p key={i} className={styles.text}>{p}</p>)}
        {note && <p className={styles.note}>{note}</p>}
      </div>
      <div className={styles.actions}>
        <button ref={cancelRef} type="button" className={styles.cancelBtn} onClick={onCancel}>
          {cancelLabel ?? t('confirm.cancel')}
        </button>
        <button type="button"
          className={destructive ? styles.destructiveBtn : styles.confirmBtn}
          onClick={onConfirm}>
          {confirmLabel ?? t('confirm.ok')}
        </button>
      </div>
    </Overlay>
  );
}
