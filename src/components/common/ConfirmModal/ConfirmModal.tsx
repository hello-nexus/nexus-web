import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { Overlay } from '../Overlay/Overlay';
import { Button } from '../Button/Button';
import { Notice } from '../Notice/Notice';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import { useStackOnOverflow } from './useStackOnOverflow';
import styles from './ConfirmModal.module.scss';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  /** Optional icon left of the title, as in DeviceModal's header. */
  icon?: ReactNode;
  /** Body text. May contain plain newlines; they are rendered as paragraph breaks. */
  message: string;
  /** Optional bulleted list rendered below the message (e.g. items affected). */
  bullets?: string[];
  /** Modal width: wide fits a line of prose or a list of sentences; default suits a short question. */
  size?: 'default' | 'wide' | 'wider';
  /** 'warning' colours the bullet markers in the warning tone, for a list of hazards. */
  bulletTone?: 'default' | 'warning';
  /** Optional secondary line, shown as a Notice of level `noteTone` below the main message. */
  note?: string;
  /** The note's Notice level: warning for an irreversible step, critical for a failure. */
  noteTone?: 'info' | 'warning' | 'critical';
  /** Extra content rendered after the note, before the actions row (e.g. a password field for a destructive confirm). */
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style the confirm button as destructive (red). Default true since this is used for deletes. */
  destructive?: boolean;
  /** Disables the confirm button, e.g. while a caller-tracked async onConfirm is still in flight. */
  confirmDisabled?: boolean;
  /** Drops the confirm button, for a prompt whose only action is the cancel button (relabelled via cancelLabel). */
  hideConfirm?: boolean;
  /**
   * Optional third action, rendered as the primary button with confirm
   * demoted beside it. For a prompt where the safe way out is doing the work
   * rather than abandoning it: "you have unsaved edits" offers Save here and
   * keeps Discard as the confirm.
   */
  primaryAction?: { label: string; onSelect: () => void; disabled?: boolean; disabledReason?: string };
  /** Enter triggers the highlighted primaryAction instead of confirm. */
  enterOnPrimary?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Esc or a backdrop click, when it should differ from the Cancel button; defaults to onCancel. */
  onDismiss?: () => void;
}

/**
 * Native-in-app modal confirmation. Matches the app chrome (backdrop blur +
 * elevated surface + accent token for the primary button). Used instead of
 * window.confirm so the UI is themed and can carry multi-line context.
 *
 * Footer: Cancel on the left, the submit buttons on the right, no header X.
 * Esc cancels, Enter confirms, click outside cancels. Autofocuses Cancel so
 * destructive actions require an explicit user intent.
 */
export function ConfirmModal({
  open,
  title,
  icon,
  message,
  bullets,
  size = 'default',
  bulletTone = 'default',
  note,
  noteTone = 'info',
  children,
  confirmLabel,
  cancelLabel,
  destructive = true,
  confirmDisabled = false,
  hideConfirm = false,
  primaryAction,
  enterOnPrimary = false,
  onConfirm,
  onCancel,
  onDismiss,
}: ConfirmModalProps) {
  const { t } = useTranslation();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  useStackOnOverflow(actionsRef, styles.stacked, open);

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const enterHandler = enterOnPrimary && primaryAction
    ? (primaryAction.disabled ? undefined : primaryAction.onSelect)
    : (confirmDisabled || hideConfirm ? undefined : onConfirm);

  const paragraphs = message.split(/\n+/).filter(p => p.length > 0);

  return (
    <Overlay open={open} onClose={onDismiss ?? onCancel} variant="alert" onEnter={enterHandler}
      backdropClassName={styles.backdrop}
      className={size === 'wider' ? `${styles.modal} ${styles.wider}` : size === 'wide' ? `${styles.modal} ${styles.wide}` : styles.modal} ariaLabel={title}>
      {icon ? (
        <div className={styles.titleRow}>
          <span className={styles.icon}>{icon}</span>
          <h2 className={styles.title}>{title}</h2>
        </div>
      ) : <h2 className={styles.title}>{title}</h2>}
      <div className={styles.body}>
        {paragraphs.map((p, i) => <p key={i} className={styles.text}>{p}</p>)}
        {bullets && bullets.length > 0 && (
          <ul className={bulletTone === 'warning' ? `${styles.bullets} ${styles.bulletsWarning}` : styles.bullets}>
            {bullets.map((b, i) => <li key={i}>{bulletTone === 'warning' ? <span>{b}</span> : b}</li>)}
          </ul>
        )}
        {note && <div className={styles.note}><Notice tone={noteTone} role="status">{note}</Notice></div>}
        {children}
      </div>
      <div ref={actionsRef} className={styles.actions}>
        <Button ref={cancelRef} tone="neutral" size="md" onClick={onCancel}>
          {cancelLabel ?? t('confirm.cancel')}
        </Button>
        <div className={styles.actionsEnd}>
        {!hideConfirm && (
          <Button
            // With a primary action present, confirm is the other way out and
            // never the accent button.
            tone={destructive ? 'danger-solid' : primaryAction ? 'neutral' : 'accent'}
            size="md"
            onClick={onConfirm}
            disabled={confirmDisabled}>
            {confirmLabel ?? t('confirm.ok')}
          </Button>
        )}
        {primaryAction && (() => {
          const btn = (
            <Button
              tone="accent"
              size="md"
              onClick={primaryAction.onSelect}
              disabled={primaryAction.disabled}>
              {primaryAction.label}
            </Button>
          );
          return primaryAction.disabled && primaryAction.disabledReason
            ? <HoverTooltip body={primaryAction.disabledReason} side="top">{btn}</HoverTooltip>
            : btn;
        })()}
        </div>
      </div>
    </Overlay>
  );
}
