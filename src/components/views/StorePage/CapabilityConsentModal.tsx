import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { Badge } from '../../common/Badge/Badge';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { capabilityLabel } from './capabilityLabels';
import styles from './CapabilityConsentModal.module.scss';

export interface ConsentRequest {
  appName: string;
  /** Every grant to approve. */
  requested: string[];
  /** For an update: the subset the installed version lacks, highlighted. */
  added?: string[];
}

interface Pending extends ConsentRequest { resolve: (allowed: boolean) => void }

interface CapabilityConsentModalProps extends ConsentRequest {
  open: boolean;
  onAllow: () => void;
  onCancel: () => void;
}

export function CapabilityConsentModal({ open, appName, requested, added, onAllow, onCancel }: CapabilityConsentModalProps) {
  const { t } = useTranslation();
  const isUpdate = added !== undefined && added.length > 0;
  return (
    <ConfirmModal
      open={open}
      title={t('store.consent.title', { name: appName })}
      message={t(isUpdate ? 'store.consent.introUpdate' : 'store.consent.intro', { name: appName })}
      confirmLabel={t('store.consent.allow')}
      destructive={false}
      onConfirm={onAllow}
      onCancel={onCancel}
    >
      <ul className={styles.list}>
        {requested.map(grant => {
          const isNew = isUpdate && added.includes(grant);
          return (
            <li key={grant} className={isNew ? styles.added : undefined}>
              {isNew && <><Badge label={t('store.consent.new')} color="var(--accent)" />{' '}</>}
              {capabilityLabel(grant, t)}
            </li>
          );
        })}
      </ul>
    </ConfirmModal>
  );
}

/** ask() opens the dialog and resolves with the user's choice; render `dialog` once in the owning component. */
export function useCapabilityConsent(): { ask: (request: ConsentRequest) => Promise<boolean>; dialog: ReactNode } {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);

  const ask = useCallback((request: ConsentRequest) => new Promise<boolean>(resolve => {
    const next = { ...request, resolve };
    // A newer prompt replaces an open one, which counts as declined.
    pendingRef.current?.resolve(false);
    pendingRef.current = next;
    setPending(next);
  }), []);

  const settle = (allowed: boolean) => {
    pendingRef.current?.resolve(allowed);
    pendingRef.current = null;
    setPending(null);
  };

  // The modal portals out of the DOM but not out of the React tree: without
  // this wrapper a backdrop click would bubble to a clickable card around the caller.
  const dialog = pending ? (
    <span role="presentation" onClick={e => e.stopPropagation()}>
      <CapabilityConsentModal
        open
        appName={pending.appName}
        requested={pending.requested}
        added={pending.added}
        onAllow={() => settle(true)}
        onCancel={() => settle(false)}
      />
    </span>
  ) : null;

  return { ask, dialog };
}
