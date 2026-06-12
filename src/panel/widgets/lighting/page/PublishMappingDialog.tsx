import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from '../../../../lib/i18n';
import { Overlay } from '../../../../components/common/Overlay/Overlay';
import styles from './PublishMappingDialog.module.scss';

// Caps mirror the artifact schema limits enforced by the service
// (MappingSchema in nexus-service).
const MAX_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_AUTHOR_LENGTH = 60;

export interface PublishMappingFields {
  name: string;
  description?: string;
  authorName?: string;
}

/**
 * Name + optional description + optional display name form for publishing the
 * current layout to the community registry. Modeled on PromptModal but with
 * multiple fields; no Overlay onEnter wiring because Enter must insert
 * newlines in the description textarea.
 */
export function PublishMappingDialog({ open, busy, onSubmit, onCancel }: {
  open: boolean;
  /** Disables the submit button while the publish POST is in flight. */
  busy: boolean;
  onSubmit: (fields: PublishMappingFields) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const nameRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [authorName, setAuthorName] = useState('');

  useEffect(() => {
    if (!open) return;
    setName('');
    setDescription('');
    setAuthorName('');
    // Defer focus to the next frame so the Overlay surface has mounted.
    const handle = requestAnimationFrame(() => nameRef.current?.focus());
    return () => cancelAnimationFrame(handle);
  }, [open]);

  if (!open) return null;

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit({
      name: trimmed,
      description: description.trim() || undefined,
      authorName: authorName.trim() || undefined,
    });
  };

  return (
    <Overlay open={open} onClose={onCancel} variant="alert"
      className={styles.modal} ariaLabel={t('lighting.mappings.publishTitle')}>
      <h2 className={styles.title}>{t('lighting.mappings.publishTitle')}</h2>
      <p className={styles.message}>{t('lighting.mappings.publishIntro')}</p>
      <div className={styles.fieldWrap}>
        <label htmlFor={`${baseId}-name`} className={styles.label}>
          {t('lighting.mappings.publishName')}
        </label>
        <input
          ref={nameRef}
          id={`${baseId}-name`}
          type="text"
          className={styles.input}
          value={name}
          maxLength={MAX_NAME_LENGTH}
          placeholder={t('lighting.mappings.publishNamePlaceholder')}
          onChange={e => setName(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <div className={styles.fieldWrap}>
        <label htmlFor={`${baseId}-description`} className={styles.label}>
          {t('lighting.mappings.publishDescription')}
        </label>
        <textarea
          id={`${baseId}-description`}
          className={styles.textarea}
          value={description}
          maxLength={MAX_DESCRIPTION_LENGTH}
          rows={3}
          onChange={e => setDescription(e.target.value)}
          spellCheck={false}
        />
      </div>
      <div className={styles.fieldWrap}>
        <label htmlFor={`${baseId}-author`} className={styles.label}>
          {t('lighting.mappings.publishAuthor')}
        </label>
        <input
          id={`${baseId}-author`}
          type="text"
          className={styles.input}
          value={authorName}
          maxLength={MAX_AUTHOR_LENGTH}
          onChange={e => setAuthorName(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>
          {t('confirm.cancel')}
        </button>
        <button type="button" className={styles.confirmBtn}
          onClick={submit} disabled={busy || !name.trim()}>
          {t('lighting.mappings.publishSubmit')}
        </button>
      </div>
    </Overlay>
  );
}
