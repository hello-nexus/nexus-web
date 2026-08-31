import { useState } from 'react';
import { Overlay } from '../../common/Overlay/Overlay';
import { AccountSignedOut, type AccountSignedOutSubtab } from '../SettingsView/Account/AccountSignedOut';
import { localServiceBackend } from '../../../api/localServiceBackend';
import { useTranslation } from '../../../lib/i18n';
import styles from './StorePage.module.scss';

interface StoreSignInModalProps {
  open: boolean;
  onClose: () => void;
  /** Fired once a session exists; the store retries the install that opened this. */
  onSignedIn: () => void;
}

/** The account gate on getting an app: the same sign-in/register/recover flows the Account page runs, in a dialog. */
export function StoreSignInModal({ open, onClose, onSignedIn }: StoreSignInModalProps) {
  const { t } = useTranslation();
  const [subtab, setSubtab] = useState<AccountSignedOutSubtab>('login');

  return (
    <Overlay open={open} onClose={onClose} ariaLabel={t('store.signIn.title')} className={styles.signInModal}>
      {/* The reused sign-in flow brings its own heading, so this only carries
          why the dialog appeared. */}
      <p className={styles.signInBody}>{t('store.signIn.body')}</p>
      <AccountSignedOut
        backend={localServiceBackend}
        subtab={subtab}
        onSubtabChange={setSubtab}
        onRecoveryApproved={onSignedIn}
        onSignedIn={onSignedIn}
      />
    </Overlay>
  );
}
